/**
 * Newsletter SanctiMaps — script Google Apps Script.
 *
 * À coller dans l'éditeur Apps Script d'une feuille Google Sheets
 * (Extensions → Apps Script). Voir newsletter/LISEZMOI.md pour l'installation.
 *
 * Ce que fait ce script, et rien d'autre :
 *   - reçoit les inscriptions du formulaire de sanctimaps.fr/lettre/ ;
 *   - envoie l'e-mail de confirmation (double opt-in) ;
 *   - gère la désinscription et la suppression des données ;
 *   - chaque matin, lit la lettre du jour écrite dans le dépôt SanctiMaps
 *     (newsletter/AAAA-MM-JJ.md) et l'envoie aux abonnés confirmés ;
 *   - ne l'envoie jamais deux fois le même jour.
 *
 * La liste des abonnés reste dans cette feuille, chez vous.
 * Les e-mails partent de votre compte Gmail.
 */

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

const CONFIG = {
  NOM_EXPEDITEUR: 'SanctiMaps',
  FUSEAU: 'Europe/Paris',
  HEURE_ENVOI: 7, // heure d'envoi quotidien (fuseau ci-dessus)
  SITE: 'https://sanctimaps.fr',
  PAGE_LETTRE: 'https://sanctimaps.fr/lettre/',
  // La lettre du jour : SOURCE_LETTRES + AAAA-MM-JJ.md
  SOURCE_LETTRES: 'https://sanctimaps.fr/newsletter/',
  // Les saints du jour, ajoutés sous la lettre (laisser '' pour ne pas les ajouter) :
  // SOURCE_SAINTS + MM-JJ.json
  SOURCE_SAINTS: 'https://sanctimaps.fr/api/newsletter/',
  NB_SAINTS: 3,
  // S'il n'y a pas de lettre écrite pour le jour : on n'envoie rien et on vous prévient.
  RAPPEL_SI_PAS_DE_LETTRE: true,
};

const TEXTE_CONSENTEMENT =
  "J'accepte de recevoir chaque jour par e-mail la newsletter de SanctiMaps. " +
  'Je peux me désinscrire à tout moment via le lien présent dans chaque e-mail.';

const FEUILLE_ABONNES = 'Abonnés';
const FEUILLE_ENVOIS = 'Envois';
const ENTETES_ABONNES = ['Email', 'Prénom', 'Statut', 'Jeton', 'Inscription', 'Confirmation', 'Désinscription', 'Source', 'Consentement'];
const ENTETES_ENVOIS = ['Date', 'Objet', 'Destinataires', 'Envoyés', 'Statut', 'Heure', 'Détail'];
const COL = { email: 0, prenom: 1, statut: 2, jeton: 3, inscription: 4, confirmation: 5, desinscription: 6, source: 7, consentement: 8 };

// ---------------------------------------------------------------------------
// Installation (à lancer une fois depuis l'éditeur)
// ---------------------------------------------------------------------------

function installer() {
  feuille_(FEUILLE_ABONNES, ENTETES_ABONNES);
  feuille_(FEUILLE_ENVOIS, ENTETES_ENVOIS);

  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'envoiQuotidien'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('envoiQuotidien')
    .timeBased()
    .atHour(CONFIG.HEURE_ENVOI)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(CONFIG.FUSEAU)
    .create();

  Logger.log('Installation terminée : envoi quotidien vers ' + CONFIG.HEURE_ENVOI + ' h (' + CONFIG.FUSEAU + ').');
  Logger.log('Étape suivante : Déployer → Nouveau déploiement → Application Web.');
}

// ---------------------------------------------------------------------------
// Pages web (formulaire, confirmation, désinscription)
// ---------------------------------------------------------------------------

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'confirmer') return pageConfirmation_(p.jeton);
  if (p.action === 'desinscrire') return pageDesinscription_(p.jeton);
  return pageFormulaire_('');
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  // Désinscription « en un clic » depuis la messagerie, ou bouton de la page.
  if (p.action === 'desinscrire' || p['List-Unsubscribe'] === 'One-Click') {
    return desinscrire_(p.jeton, p.supprimer === 'on');
  }
  return inscrire_(p);
}

function inscrire_(p) {
  // Champ piège : les robots le remplissent, les humains ne le voient pas.
  if (p.website) return page_('Merci !', messageGenerique_());

  const email = String(p.email || '').trim().toLowerCase().slice(0, 254);
  const prenom = String(p.prenom || p.first_name || '').trim().replace(/[<>"{}\\]/g, '').slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return pageFormulaire_("L'adresse e-mail n'est pas valide.");
  }

  // Limites anti-abus : 3 demandes par adresse et par heure, 60 au total par heure.
  const cache = CacheService.getScriptCache();
  if (!compteur_(cache, 'i:' + email, 3) || !compteur_(cache, 'global', 60)) {
    return page_('Merci !', messageGenerique_());
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let jeton = null;
  try {
    const sh = feuille_(FEUILLE_ABONNES, ENTETES_ABONNES);
    const ligne = trouverLigne_(sh, COL.email, email);
    const maintenant = new Date();
    if (ligne) {
      const statut = ligne.valeurs[COL.statut];
      if (statut === 'actif' || statut === 'bloqué') return page_('Merci !', messageGenerique_());
      jeton = ligne.valeurs[COL.jeton] || nouveauJeton_();
      sh.getRange(ligne.index, 1, 1, ENTETES_ABONNES.length).setValues([[
        email, prenom || ligne.valeurs[COL.prenom], 'en attente', jeton, maintenant, '', '',
        String(p.source || 'formulaire').slice(0, 100), TEXTE_CONSENTEMENT,
      ]]);
    } else {
      jeton = nouveauJeton_();
      sh.appendRow([email, prenom, 'en attente', jeton, maintenant, '', '',
        String(p.source || 'formulaire').slice(0, 100), TEXTE_CONSENTEMENT]);
    }
  } finally {
    lock.releaseLock();
  }

  const lien = urlScript_() + '?action=confirmer&jeton=' + encodeURIComponent(jeton);
  const bonjour = prenom ? 'Bonjour ' + prenom + ',' : 'Bonjour,';
  MailApp.sendEmail({
    to: email,
    name: CONFIG.NOM_EXPEDITEUR,
    subject: 'Confirmez votre inscription à la newsletter SanctiMaps',
    body: bonjour + '\n\nPour recevoir la newsletter de SanctiMaps, confirmez votre inscription :\n' + lien +
      "\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    htmlBody: gabarit_({
      contenu: '<p>' + esc_(bonjour) + '</p><p>Merci pour votre inscription à la newsletter de SanctiMaps.</p>' +
        '<p style="text-align:center;margin:28px 0">' + bouton_(lien, 'Confirmer mon inscription') + '</p>' +
        '<p style="color:#6b6f76;font-size:14px">Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement cet e-mail : vous ne recevrez rien.</p>',
      pied: '',
    }),
  });
  return page_('Presque terminé !', messageGenerique_());
}

function messageGenerique_() {
  return '<p>Si cette adresse n\'est pas déjà inscrite, vous allez recevoir un e-mail pour <strong>confirmer votre inscription</strong>. Pensez à regarder dans les indésirables.</p>' +
    '<p><a href="' + CONFIG.SITE + '">Retour sur SanctiMaps</a></p>';
}

function pageConfirmation_(jeton) {
  const sh = feuille_(FEUILLE_ABONNES, ENTETES_ABONNES);
  const ligne = jeton ? trouverLigne_(sh, COL.jeton, String(jeton)) : null;
  if (!ligne) return page_('Lien invalide', '<p>Ce lien de confirmation est invalide.</p>');
  if (ligne.valeurs[COL.statut] === 'en attente' || ligne.valeurs[COL.statut] === 'désinscrit') {
    sh.getRange(ligne.index, COL.statut + 1).setValue('actif');
    sh.getRange(ligne.index, COL.confirmation + 1).setValue(new Date());
    sh.getRange(ligne.index, COL.desinscription + 1).setValue('');
  }
  return page_('Inscription confirmée', '<p>Merci ! Vous recevrez la newsletter de SanctiMaps chaque matin.</p>' +
    '<p><a href="' + CONFIG.SITE + '">Retour sur SanctiMaps</a></p>');
}

function pageDesinscription_(jeton) {
  // Un bouton plutôt qu'une désinscription immédiate : les antivirus qui
  // « visitent » les liens ne désinscrivent ainsi personne par erreur.
  return page_('Se désinscrire',
    '<form method="post" action="' + urlScript_() + '" target="_top">' +
    '<input type="hidden" name="action" value="desinscrire">' +
    '<input type="hidden" name="jeton" value="' + esc_(jeton || '') + '">' +
    '<p>Vous ne souhaitez plus recevoir la newsletter de SanctiMaps ?</p>' +
    '<p><label><input type="checkbox" name="supprimer"> Supprimer aussi toutes mes données</label></p>' +
    '<p><button type="submit">Confirmer la désinscription</button></p></form>');
}

function desinscrire_(jeton, supprimer) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = feuille_(FEUILLE_ABONNES, ENTETES_ABONNES);
    const ligne = jeton ? trouverLigne_(sh, COL.jeton, String(jeton)) : null;
    if (!ligne) return page_('Lien invalide', '<p>Ce lien de désinscription est invalide.</p>');
    if (supprimer) {
      sh.deleteRow(ligne.index);
      return page_('Données supprimées', '<p>Vous êtes désinscrit(e) et toutes vos données ont été supprimées.</p>');
    }
    sh.getRange(ligne.index, COL.statut + 1).setValue('désinscrit');
    sh.getRange(ligne.index, COL.desinscription + 1).setValue(new Date());
    return page_('Désinscription confirmée', '<p>Vous ne recevrez plus la newsletter de SanctiMaps.</p>');
  } finally {
    lock.releaseLock();
  }
}

function pageFormulaire_(erreur) {
  return page_('Newsletter SanctiMaps',
    (erreur ? '<p style="color:#b42318">' + esc_(erreur) + '</p>' : '') +
    '<form method="post" action="' + urlScript_() + '" target="_top">' +
    '<p><label>Adresse e-mail<br><input type="email" name="email" required style="width:100%;padding:8px"></label></p>' +
    '<p><label>Prénom (facultatif)<br><input type="text" name="prenom" maxlength="80" style="width:100%;padding:8px"></label></p>' +
    '<input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off">' +
    '<p style="font-size:13px;color:#6b6f76">' + esc_(TEXTE_CONSENTEMENT) + '</p>' +
    '<p><button type="submit">Je m\'inscris</button></p></form>');
}

// ---------------------------------------------------------------------------
// Envoi quotidien
// ---------------------------------------------------------------------------

/** Déclenché chaque matin. Peut aussi être lancé à la main (même protection anti-doublon). */
function envoiQuotidien() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // un envoi est déjà en cours
  try {
    const date = aujourdhui_();
    const envois = feuille_(FEUILLE_ENVOIS, ENTETES_ENVOIS);
    const deja = trouverLigne_(envois, 0, date);
    if (deja && (deja.valeurs[4] === 'envoyée' || deja.valeurs[4] === 'partielle' || deja.valeurs[4] === 'en cours')) {
      Logger.log('Newsletter du ' + date + ' déjà envoyée : rien à faire.');
      return;
    }

    const lettre = chargerLettre_(date);
    if (!lettre) {
      if (!deja) {
        envois.appendRow([date, '', 0, 0, 'pas de lettre', new Date(), 'Aucun fichier newsletter/' + date + '.md']);
        if (CONFIG.RAPPEL_SI_PAS_DE_LETTRE) {
          MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
            '[SanctiMaps] Pas de newsletter écrite pour le ' + date,
            "Aucun fichier newsletter/" + date + ".md n'a été trouvé dans le dépôt SanctiMaps : " +
            "la newsletter du jour n'a pas été envoyée.\n\nPour l'envoyer plus tard dans la journée, écrivez le fichier " +
            "puis lancez la fonction envoiQuotidien depuis l'éditeur Apps Script.");
        }
      }
      return;
    }

    const abonnes = abonnesActifs_();
    const ligneIndex = deja ? deja.index : envois.getLastRow() + 1;
    envois.getRange(ligneIndex, 1, 1, 7).setValues([[date, lettre.objet, abonnes.length, 0, 'en cours', new Date(), '']]);
    SpreadsheetApp.flush();

    let envoyes = 0;
    const erreurs = [];
    for (let i = 0; i < abonnes.length; i++) {
      if (MailApp.getRemainingDailyQuota() < 1) {
        erreurs.push('Quota Gmail du jour atteint après ' + envoyes + ' envois');
        break;
      }
      const a = abonnes[i];
      const desinscription = urlScript_() + '?action=desinscrire&jeton=' + encodeURIComponent(a.jeton);
      try {
        MailApp.sendEmail({
          to: a.email,
          name: CONFIG.NOM_EXPEDITEUR,
          subject: lettre.objet,
          body: personnaliser_(lettre.texte, a.prenom, desinscription),
          htmlBody: personnaliser_(lettre.html, a.prenom, desinscription, true),
        });
        envoyes++;
      } catch (err) {
        erreurs.push(a.email.replace(/^(.).*@/, '$1***@') + ' : ' + err.message);
      }
    }

    const statut = envoyes === abonnes.length ? 'envoyée' : envoyes > 0 ? 'partielle' : 'échec';
    envois.getRange(ligneIndex, 4, 1, 4).setValues([[envoyes, statut, new Date(), erreurs.join(' | ').slice(0, 1000)]]);
  } finally {
    lock.releaseLock();
  }
}

/** Envoie la lettre du jour à votre propre adresse, sans toucher aux abonnés. */
function envoyerTest() {
  const date = aujourdhui_();
  const lettre = chargerLettre_(date);
  if (!lettre) {
    Logger.log('Aucun fichier newsletter/' + date + '.md trouvé.');
    return;
  }
  const moi = Session.getEffectiveUser().getEmail();
  const lien = urlScript_() + '?action=desinscrire&jeton=test';
  MailApp.sendEmail({
    to: moi,
    name: CONFIG.NOM_EXPEDITEUR,
    subject: '[TEST] ' + lettre.objet,
    body: personnaliser_(lettre.texte, '', lien),
    htmlBody: personnaliser_(lettre.html, '', lien, true),
  });
  Logger.log('Test envoyé à ' + moi);
}

// ---------------------------------------------------------------------------
// Composition de la lettre
// ---------------------------------------------------------------------------

function chargerLettre_(date) {
  const reponse = UrlFetchApp.fetch(CONFIG.SOURCE_LETTRES + date + '.md?v=' + Date.now(), { muteHttpExceptions: true });
  if (reponse.getResponseCode() !== 200) return null;
  const md = reponse.getContentText('UTF-8');
  let saints = null;
  if (CONFIG.SOURCE_SAINTS) {
    try {
      const r = UrlFetchApp.fetch(CONFIG.SOURCE_SAINTS + date.slice(5) + '.json', { muteHttpExceptions: true });
      if (r.getResponseCode() === 200) saints = JSON.parse(r.getContentText('UTF-8'));
    } catch (err) { /* sans saints : la lettre part quand même */ }
  }
  return composerLettre(md, date, saints);
}

/**
 * Transforme le fichier Markdown en e-mail (HTML + texte).
 * La première ligne non vide est l'objet de l'e-mail (« # » facultatif).
 * Fonction pure : testée hors de Google.
 */
function composerLettre(md, date, saints) {
  const lignes = String(md).replace(/\r\n?/g, '\n').split('\n');
  while (lignes.length && !lignes[0].trim()) lignes.shift();
  if (!lignes.length) return null;
  const objet = lignes.shift().replace(/^#+\s*/, '').replace(/^objet\s*:\s*/i, '').trim().slice(0, 200);
  const corps = lignes.join('\n').trim();
  if (!objet || !corps) return null;

  let blocSaintsHtml = '';
  let blocSaintsTexte = '';
  if (saints && saints.saints && saints.saints.length) {
    const choisis = saints.saints.slice(0, CONFIG.NB_SAINTS);
    const autres = (saints.total || saints.saints.length) - choisis.length;
    const nom = function (s) {
      return (s.status_label && !/^(saint|sainte|san|santa|santo|st\.?|bienheureux|bienheureuse)\b/i.test(s.name))
        ? s.status_label + ' ' + s.name : s.name;
    };
    blocSaintsHtml = '<h2 style="font-size:20px;color:#1f3a5f;margin:32px 0 12px">Les saints du jour</h2><ul style="padding-left:20px">' +
      choisis.map(function (s) {
        return '<li style="margin-bottom:8px"><a href="' + esc_(urlSure_(s.url)) + '" style="color:#1f3a5f;font-weight:bold">' + esc_(nom(s)) + '</a>' +
          (s.description ? ' — ' + esc_(s.description) : '') + '</li>';
      }).join('') + '</ul>' +
      (autres > 0 && saints.day_url ? '<p><a href="' + esc_(urlSure_(saints.day_url)) + '" style="color:#1f3a5f">Et ' + autres + ' autre' + (autres > 1 ? 's' : '') + ' saint' + (autres > 1 ? 's' : '') + ' fêté' + (autres > 1 ? 's' : '') + ' ce jour</a></p>' : '');
    blocSaintsTexte = '\n\nLES SAINTS DU JOUR\n' + choisis.map(function (s) {
      return '- ' + nom(s) + (s.description ? ' — ' + s.description : '') + ' : ' + s.url;
    }).join('\n') + (autres > 0 && saints.day_url ? '\nEt ' + autres + ' autre(s) : ' + saints.day_url : '');
  }

  const dateLisible = Utilities.formatDate(new Date(date + 'T12:00:00Z'), CONFIG.FUSEAU, 'EEEE d MMMM yyyy');
  const html = gabarit_({
    contenu: '<p>{{BONJOUR}}</p>' +
      '<p style="color:#b8860b;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin:0">' + esc_(dateFr_(date)) + '</p>' +
      '<h1 style="font-size:26px;color:#1f3a5f;margin:6px 0 20px">' + esc_(objet) + '</h1>' +
      markdownVersHtml(corps) + blocSaintsHtml,
    pied: '<a href="{{DESINSCRIPTION}}" style="color:#6b6f76">Se désinscrire</a> · ' +
      '<a href="' + CONFIG.SITE + '" style="color:#6b6f76">sanctimaps.fr</a>',
  });
  const texte = '{{BONJOUR}}\n\n' + dateFr_(date).toUpperCase() + '\n' + objet + '\n\n' +
    markdownVersTexte(corps) + blocSaintsTexte +
    '\n\n—\nSe désinscrire : {{DESINSCRIPTION}}\n' + CONFIG.SITE;
  return { objet: objet, html: html, texte: texte, date: date, dateLisible: dateLisible };
}

function personnaliser_(contenu, prenom, desinscription, html) {
  const bonjour = prenom ? 'Bonjour ' + prenom + ',' : 'Bonjour,';
  return contenu
    .split('{{BONJOUR}}').join(html ? esc_(bonjour) : bonjour)
    .split('{{DESINSCRIPTION}}').join(html ? esc_(desinscription) : desinscription);
}

/** Markdown simple → HTML : titres, paragraphes, gras, italique, liens, listes, citations. */
function markdownVersHtml(md) {
  const blocs = String(md).split(/\n\s*\n/);
  const style = 'font-family:Georgia,serif;font-size:17px;line-height:27px;color:#2b2b2b';
  return blocs.map(function (bloc) {
    const b = bloc.trim();
    if (!b) return '';
    let m = b.match(/^(#{1,3})\s+(.*)$/);
    if (m && b.indexOf('\n') === -1) {
      const taille = { 1: 24, 2: 20, 3: 18 }[m[1].length];
      return '<h2 style="font-size:' + taille + 'px;color:#1f3a5f;margin:28px 0 10px">' + enLigne_(m[2]) + '</h2>';
    }
    if (/^(-{3,}|\*{3,})$/.test(b)) return '<hr style="border:0;border-top:1px solid #e6e0d4;margin:24px 0">';
    const lignes = b.split('\n');
    if (lignes.every(function (l) { return /^\s*[-*]\s+/.test(l); })) {
      return '<ul style="' + style + '">' + lignes.map(function (l) { return '<li>' + enLigne_(l.replace(/^\s*[-*]\s+/, '')) + '</li>'; }).join('') + '</ul>';
    }
    if (lignes.every(function (l) { return /^\s*\d+[.)]\s+/.test(l); })) {
      return '<ol style="' + style + '">' + lignes.map(function (l) { return '<li>' + enLigne_(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>'; }).join('') + '</ol>';
    }
    if (lignes.every(function (l) { return /^\s*>/.test(l); })) {
      return '<blockquote style="border-left:3px solid #b8860b;margin:16px 0;padding:4px 16px;font-style:italic;' + style + '">' +
        lignes.map(function (l) { return enLigne_(l.replace(/^\s*>\s?/, '')); }).join('<br>') + '</blockquote>';
    }
    return '<p style="' + style + ';margin:0 0 16px">' + lignes.map(enLigne_).join('<br>') + '</p>';
  }).join('\n');
}

function enLigne_(texte) {
  let t = esc_(texte);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, libelle, url) {
    const sure = urlSure_(url.replace(/&amp;/g, '&'));
    return sure ? '<a href="' + esc_(sure) + '" style="color:#1f3a5f">' + libelle + '</a>' : libelle;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>');
  return t;
}

function markdownVersTexte(md) {
  return String(md)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '  ');
}

function gabarit_(o) {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f4f1ea">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">' +
    '<tr><td align="center" style="padding:0 0 20px;font-family:Georgia,serif;font-size:28px;font-weight:bold;color:#1f3a5f">SanctiMaps</td></tr>' +
    '<tr><td style="background:#ffffff;border:1px solid #e6e0d4;border-radius:8px;padding:28px;font-family:Georgia,serif;font-size:17px;line-height:27px;color:#2b2b2b">' +
    o.contenu + '</td></tr>' +
    (o.pied ? '<tr><td align="center" style="padding:20px;font-family:Arial,sans-serif;font-size:12px;color:#6b6f76">' + o.pied + '</td></tr>' : '') +
    '</table></td></tr></table></body></html>';
}

function bouton_(url, libelle) {
  return '<a href="' + esc_(url) + '" style="display:inline-block;padding:13px 26px;background:#1f3a5f;color:#ffffff;text-decoration:none;border-radius:6px;font-family:Arial,sans-serif;font-weight:bold">' + esc_(libelle) + '</a>';
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function abonnesActifs_() {
  const sh = feuille_(FEUILLE_ABONNES, ENTETES_ABONNES);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, ENTETES_ABONNES.length).getValues()
    .filter(function (r) { return r[COL.statut] === 'actif' && r[COL.email]; })
    .map(function (r) { return { email: String(r[COL.email]), prenom: String(r[COL.prenom] || ''), jeton: String(r[COL.jeton]) }; });
}

function feuille_(nom, entetes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nom);
  if (!sh) {
    sh = ss.insertSheet(nom);
    sh.appendRow(entetes);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, entetes.length).setFontWeight('bold');
  }
  return sh;
}

function trouverLigne_(sh, colonne, valeur) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return null;
  const donnees = sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
  for (let i = 0; i < donnees.length; i++) {
    const v = donnees[i][colonne];
    const texte = v instanceof Date ? Utilities.formatDate(v, CONFIG.FUSEAU, 'yyyy-MM-dd') : String(v);
    if (texte.toLowerCase() === String(valeur).toLowerCase()) return { index: i + 2, valeurs: donnees[i] };
  }
  return null;
}

function compteur_(cache, cle, max) {
  const n = Number(cache.get(cle) || 0);
  if (n >= max) return false;
  cache.put(cle, String(n + 1), 3600);
  return true;
}

function nouveauJeton_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function urlScript_() {
  return ScriptApp.getService().getUrl();
}

function aujourdhui_() {
  return Utilities.formatDate(new Date(), CONFIG.FUSEAU, 'yyyy-MM-dd');
}

function dateFr_(iso) {
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const d = new Date(iso + 'T12:00:00Z');
  const j = d.getUTCDate();
  return jours[d.getUTCDay()] + ' ' + (j === 1 ? '1er' : j) + ' ' + mois[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function urlSure_(url) {
  return /^https?:\/\/[^\s"'<>]+$/i.test(String(url || '')) ? String(url) : '';
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page_(titre, contenu) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Georgia,serif;max-width:520px;margin:32px auto;padding:0 16px;color:#2b2b2b;line-height:1.5">' +
    '<p style="font-size:24px;font-weight:bold;color:#1f3a5f;margin:0 0 16px">SanctiMaps</p>' +
    '<h1 style="font-size:22px">' + esc_(titre) + '</h1>' + contenu + '</div>')
    .setTitle(titre + ' — SanctiMaps')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
