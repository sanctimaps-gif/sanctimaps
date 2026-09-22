/**
 * Routeurs de courriel.
 *
 * La lettre ne dépend d'aucune maison en particulier. Trois façons d'envoyer
 * sont prévues, toutes par HTTP et sans aucune dépendance — le seul `fetch` de
 * Node suffit, comme pour les fournisseurs de modèle :
 *
 *   brevo    maison française, 300 courriels par jour gratuitement.
 *   resend   la plus simple à mettre en route ; 3 000 par mois gratuitement.
 *   mailjet  maison française également, 6 000 par mois, 200 par jour.
 *
 * Ce qui change d'un routeur à l'autre — l'adresse, l'en-tête
 * d'authentification, le nom des champs, l'endroit où lire l'erreur — est
 * confiné ici. Le reste de l'outil ignore lequel est en service.
 *
 * Se règle par l'environnement :
 *
 *   MAIL_PROVIDER    brevo | resend | mailjet   (déduit si absent)
 *   MAIL_API_KEY     la clé du routeur
 *   MAIL_API_SECRET  le second jeton, pour Mailjet seul
 *   MAIL_FROM        « SanctiMaps <lettre@sanctimaps.fr> »
 *   MAIL_TO          une ou plusieurs adresses, séparées par des virgules
 *
 * ## Ce qu'il faut savoir avant de brancher quoi que ce soit
 *
 * L'adresse d'expédition doit appartenir à un domaine que le routeur a
 * vérifié, et ce domaine doit porter les enregistrements SPF et DKIM que le
 * routeur indique. Sans cela le courriel part quand même — et arrive dans les
 * indésirables, ou nulle part. Ce n'est pas une formalité qu'on peut sauter :
 * c'est la moitié du travail.
 *
 * Aucune clé n'est écrite dans ce dépôt, ni aucune adresse. Elles vivent dans
 * les secrets du dépôt GitHub, que l'atelier lit au moment d'envoyer.
 */

/** Au-delà, le routeur ne répond pas : mieux vaut échouer que pendre. */
const TIMEOUT = 30000;

async function poste(url, init) {
  const signal = AbortSignal.timeout(TIMEOUT);
  const reponse = await fetch(url, { ...init, signal });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`${reponse.status} ${reponse.statusText} — ${texte.slice(0, 400)}`);
  }
  return texte;
}

/**
 * Sépare « Nom <adresse> » en ses deux parties.
 *
 * Brevo et Mailjet veulent les deux séparément ; Resend accepte la forme
 * entière. On coupe donc une fois pour toutes.
 */
export function coupeAdresse(valeur) {
  const brut = String(valeur || '').trim();
  const avec = brut.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (avec) return { nom: avec[1].replace(/^"|"$/g, ''), email: avec[2].trim() };
  return { nom: '', email: brut };
}

const brevo = {
  id: 'brevo',
  label: 'Brevo',
  besoin: ['MAIL_API_KEY'],
  async envoie({ cle, de, a, sujet, html, texte }) {
    await poste('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': cle, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: de.nom ? { name: de.nom, email: de.email } : { email: de.email },
        to: [{ email: a }],
        subject: sujet,
        htmlContent: html,
        textContent: texte,
      }),
    });
  },
};

const resend = {
  id: 'resend',
  label: 'Resend',
  besoin: ['MAIL_API_KEY'],
  async envoie({ cle, de, a, sujet, html, texte }) {
    await poste('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: de.nom ? `${de.nom} <${de.email}>` : de.email,
        to: [a],
        subject: sujet,
        html,
        text: texte,
      }),
    });
  },
};

const mailjet = {
  id: 'mailjet',
  label: 'Mailjet',
  besoin: ['MAIL_API_KEY', 'MAIL_API_SECRET'],
  async envoie({ cle, secret, de, a, sujet, html, texte }) {
    const jeton = Buffer.from(`${cle}:${secret}`).toString('base64');
    await poste('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { authorization: `Basic ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        Messages: [{
          From: de.nom ? { Email: de.email, Name: de.nom } : { Email: de.email },
          To: [{ Email: a }],
          Subject: sujet,
          HTMLPart: html,
          TextPart: texte,
        }],
      }),
    });
  },
};

const ROUTEURS = { brevo, resend, mailjet };

export const nomsRouteurs = Object.keys(ROUTEURS);

/**
 * Le routeur en service, et de quoi l'appeler.
 *
 * Rend `null` plutôt que de lever : un atelier qui tourne avant que les
 * secrets soient posés doit pouvoir le dire calmement et s'arrêter là.
 */
export function routeurConfigure(env = process.env) {
  const demande = (env.MAIL_PROVIDER || '').trim().toLowerCase();
  const cle = (env.MAIL_API_KEY || '').trim();
  const secret = (env.MAIL_API_SECRET || '').trim();
  if (!cle) return null;

  // Sans indication, on devine : Resend préfixe ses clés, Mailjet en demande
  // deux. Brevo reste le cas ordinaire.
  const id = ROUTEURS[demande] ? demande
    : cle.startsWith('re_') ? 'resend'
      : secret ? 'mailjet' : 'brevo';
  const routeur = ROUTEURS[id];

  const manque = routeur.besoin.filter((nom) => !(env[nom] || '').trim());
  if (manque.length) return { routeur, manque };

  const de = coupeAdresse(env.MAIL_FROM);
  const destinataires = String(env.MAIL_TO || '')
    .split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

  return { routeur, cle, secret, de, destinataires, manque: [] };
}

/**
 * Envoie un courriel à chaque destinataire, séparément.
 *
 * Séparément, et c'est délibéré : mettre dix adresses dans un même champ « à »
 * les montre toutes à chacun. Une lettre n'a pas à révéler qui la reçoit. Une
 * erreur sur l'un n'arrête pas les autres — on rend la liste de ce qui est
 * parti et de ce qui a échoué.
 */
export async function envoieATous(config, message) {
  const resultats = [];
  for (const a of config.destinataires) {
    try {
      await config.routeur.envoie({ ...config, a, ...message });
      resultats.push({ a, ok: true });
    } catch (erreur) {
      resultats.push({ a, ok: false, erreur: String(erreur.message || erreur) });
    }
  }
  return resultats;
}
