# La newsletter de SanctiMaps

Vous écrivez la lettre ; elle part toute seule chaque matin à 7 h (heure de Paris)
depuis votre Gmail, à tous les abonnés confirmés. Sans serveur, sans abonnement payant.

| Quoi | Où |
|---|---|
| La lettre du jour | ce dossier : `newsletter/AAAA-MM-JJ.md` |
| La liste des abonnés | votre tableur Google « Newsletter SanctiMaps » |
| Le formulaire d'inscription | https://sanctimaps.fr/lettre/ |
| L'envoi, les confirmations, les désinscriptions | le script Google `tools/newsletter/Code.gs` |

---

## Écrire une lettre (chaque jour)

Depuis l'application GitHub ou github.com :

1. Ouvrez le dossier `newsletter/` du dépôt `sanctimaps`.
2. **Add file** → **Create new file**.
3. Nom du fichier : la date d'envoi, par exemple `2026-09-24.md`.
4. **Première ligne : l'objet de l'e-mail.** Puis une ligne vide, puis le texte.
5. **Commit changes** — sur la branche principale du site.

Exemple :

```
Saint Vincent de Paul, l'apôtre de la charité

Aujourd'hui nous fêtons **saint Vincent de Paul**…
```

La mise en forme possible est décrite dans [`modele.md`](modele.md).
Vous pouvez écrire plusieurs jours à l'avance : chaque fichier part le jour de sa date.

S'il n'y a **pas de fichier** pour le jour, rien n'est envoyé et vous recevez un
e-mail de rappel. Une lettre n'est **jamais envoyée deux fois** le même jour.

---

## Installation (une seule fois, environ 15 minutes)

Plus confortable sur ordinateur (l'éditeur Google Apps Script est peu pratique sur téléphone).

### 1. Le tableur et le script

1. Sur **sheets.google.com**, créez un tableur vide nommé **Newsletter SanctiMaps**
   (avec le compte Gmail qui enverra la newsletter).
2. Menu **Extensions → Apps Script**.
3. Effacez le contenu de `Code.gs` et collez à la place **tout** le contenu de
   [`tools/newsletter/Code.gs`](../tools/newsletter/Code.gs). Enregistrez (icône disquette).
4. En haut, choisissez la fonction **installer** puis **Exécuter**.
   Google demande des autorisations : **Examiner les autorisations** → votre compte →
   **Paramètres avancés** → **Accéder à … (non sécurisé)** → **Autoriser**.
   (Ce message apparaît pour tout script personnel : c'est le vôtre.)
   Le tableur contient maintenant deux onglets : **Abonnés** et **Envois**.

### 2. Publier le script

1. **Déployer → Nouveau déploiement**.
2. Type (roue dentée) : **Application Web**.
3. **Exécuter en tant que : Moi** — **Qui a accès : Tout le monde**.
4. **Déployer**, puis copiez l'**URL de l'application Web**
   (elle se termine par `/exec`).

### 3. Afficher le formulaire sur SanctiMaps

Dans le dépôt, ouvrez `data/newsletter.json`, cliquez sur le crayon ✏️ et collez l'URL :

```json
{
  "abonnement": "https://script.google.com/macros/s/…/exec"
}
```

Le formulaire apparaît sur https://sanctimaps.fr/lettre/ à la prochaine régénération des pages
(`npm run build:pages`, ou l'import quotidien).

### 4. Tester

- Inscrivez-vous vous-même sur la page du formulaire et confirmez depuis l'e-mail reçu :
  votre adresse apparaît en **actif** dans l'onglet **Abonnés**.
- Écrivez le fichier du jour, puis dans Apps Script lancez **envoyerTest** :
  la lettre arrive dans votre boîte avec « [TEST] » dans l'objet, sans rien envoyer aux abonnés.

---

## Bon à savoir

- **Heure d'envoi** : 7 h, heure de Paris (à quelques minutes près). Pour la changer,
  modifiez `HEURE_ENVOI` en haut du script, puis relancez **installer**.
- **Envoyer plus tard dans la journée** (fichier écrit en retard) : lancez **envoiQuotidien**
  dans Apps Script. Si la lettre du jour est déjà partie, rien ne se passe.
- **Limite Gmail** : un compte Gmail gratuit envoie au plus **100 e-mails par jour**
  depuis un script (1 500 avec Google Workspace). Au-delà, la lettre part aux 100 premiers
  et l'onglet **Envois** indique « partielle ». Il faudra alors passer à une autre solution d'envoi.
- **Historique** : l'onglet **Envois** garde chaque jour la date, l'objet, le nombre d'envois et le statut.
- **Abonnés** : statuts `en attente` (pas encore confirmé), `actif`, `désinscrit`.
  Pour bloquer quelqu'un, écrivez `bloqué` dans sa colonne Statut. Pour supprimer ses données, supprimez la ligne.
- **Modifier le script** : après toute modification du code, faites **Déployer → Gérer les déploiements →
  ✏️ → Version : Nouvelle version → Déployer** (l'URL ne change pas).
- **RGPD** : double confirmation à l'inscription, preuve du consentement (date, texte accepté),
  lien de désinscription dans chaque e-mail avec option de suppression des données.
  Les données restent dans votre tableur privé.
