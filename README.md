# SanctiMaps

Carte mondiale interactive des saints de l'Église catholique. L'application
s'ouvre directement sur le planisphère : on choisit un continent, puis un pays,
et le pays se déploie à l'écran sur un fond de rues, où chaque croix marque le
lieu de naissance d'un saint.

## Démarrer

```bash
npm start                                   # http://127.0.0.1:8080
AI_PROVIDER=ollama npm start                # avec l'assistant, modèle local
HOST=0.0.0.0 npm start                      # ouvre l'accès au réseau local
```

Aucune installation n'est nécessaire pour lancer l'application : le serveur
fourni n'utilise que Node. `npm install` ne sert qu'à régénérer les données
(voir plus bas).

La carte est un site statique : aucun outil de compilation, aucune bibliothèque
chargée depuis un CDN, aucune requête réseau pour l'afficher — hormis le fond
de rues sous la vue pays, qui se coupe d'un réglage et dont l'absence n'empêche
rien. Le serveur ne sert qu'à deux choses : distribuer les fichiers, et — si un fournisseur de
modèle est configuré — porter les appels sans jamais confier de clé au
navigateur.

## Comment on navigue

Les trois échelles de lecture s'enchaînent, et chacune fixe ce qui est possible :

| Échelle | Ce que l'on voit | Ce que l'on peut faire |
| --- | --- | --- |
| **Monde** | Les continents. Les pays comptant des saints sont d'une autre couleur. | Choisir un continent — le zoom est verrouillé. |
| **Continent** | Les pays du continent, nommés et comptés. | Choisir un pays — le zoom reste verrouillé. |
| **Pays** | Le pays entier à l'écran sur un fond de rues, et une croix par lieu de naissance. | Zoomer jusqu'à la rue, se déplacer, ouvrir une fiche. Commandes de zoom et barre d'échelle apparaissent ici. |

Le planisphère occupe toute la hauteur de l'écran, quitte à sortir par les
côtés : le montrer en entier le réduisait à un bandeau au milieu, entre deux
larges bandes de mer. On arrive donc dans la carte, et le déplacement — borné,
comme toujours — découvre ce qui dépasse.

Au monde, un cartouche annonce l'étendue du corpus — « 285 saints recensés
dans 57 pays » — avant même le premier clic. Il s'efface dès qu'on descend
d'une échelle, où le compte devient celui du pays ouvert.

Le déplacement est borné à chaque échelle : on ne peut pas dériver
indéfiniment hors de la carte. La touche `Échap` remonte d'un niveau — de
même qu'un clic sur la mer, tant qu'aucun fond de rues n'est posé ; le fil
d'Ariane et les puces de continents permettent d'aller directement où l'on
veut.

### Zoomer, une fois un pays ouvert

Quatre gestes pour la même chose, parce qu'aucun n'est donné à tout le monde :

| | |
| --- | --- |
| **Boutons `+` `−`** | Sur le flanc de la carte. Le troisième, `⤢`, revient au pays entier. |
| **Molette** | Zoome autour du curseur. |
| **Pincement** | Deux doigts, sur écran tactile. |
| **Clavier** | `+`, `−`, et `0` pour revenir au pays entier. |

Une **barre d'échelle** en bas à gauche dit à quelle distance on regarde
vraiment — « 100 km » à l'arrivée sur la France, « 100 m » au plus près. Elle
est calculée à la latitude du milieu de l'écran, seul endroit où elle est
exacte en projection Mercator.

La borne du zoom ne se compte pas en « fois » mais en mètres par pixel : à
quarante fois le cadrage, la Belgique serait dans la rue et la Russie encore à
deux cents kilomètres du sol. Chaque pays descend donc jusqu'à la même échelle
au sol — celle où les villages se nomment sans fond de tuiles, celle de la rue
avec.

### Dans un pays : le fond de carte

Dès qu'un pays s'ouvre, un fond de tuiles OpenStreetMap se pose sous la carte
et apporte les rues, les routes et les cours d'eau. On peut alors descendre
jusqu'au pâté de maisons, échelle « 100 m », et voir la rue où le saint est né.

Aux échelles supérieures — monde, continent — il n'y a pas de fond : la carte
est thématique, elle dit quels pays comptent des saints, et des rues n'y
auraient aucun sens.

Le partage est net : **la carte porte la géographie, nous portons les
saints**. Sous les tuiles, nos propres noms de localités et nos points de
villes disparaissent — le fond écrit déjà chaque bourg, les redoubler ne
ferait que les brouiller. Ne restent que les croix des lieux de naissance.

Rien de ce fond ne se clique. Les tuiles happeraient chaque tapotement et le
prendraient pour un clic « à côté » ; les pays voisins, devenus invisibles,
seraient des cibles qu'on ne voit pas. **On change de pays en remontant au
continent** — par le fil d'Ariane ou la touche `Échap` — et seules les croix
des saints répondent au clic.

C'est la seule chose de l'application qui sorte sur le réseau, et elle est
faite pour pouvoir manquer. Fournisseur coupé, réseau absent, réglage sur
« jamais » : après quelques essais infructueux l'application renonce, les
villes et les villages reparaissent — dessinés par nos soins, comme avant —,
le zoom se resserre là où il a encore de quoi montrer quelque chose, et rien
d'autre ne change. Le réglage se trouve dans
**Paramètres → Fond de carte détaillé**.

La mention « © OpenStreetMap » s'affiche dès qu'une tuile est visible : c'est
une condition de la licence du fond, pas une politesse. Changer de fournisseur
tient en deux lignes dans `src/js/basemap.js`.

### Le grain de la vue pays, sans fond de tuiles

Ce qui suit ne vaut que lorsque le fond de carte est coupé — réglage sur
« jamais », réseau absent, fournisseur muet. La carte revient alors à ses
propres localités, et c'est ce dessin-là qui s'applique.

Plus on zoome, plus la carte descend dans la hiérarchie des localités : une
quarantaine de villes au cadrage d'arrivée, puis les bourgs, puis les villages.
Le nombre de noms à l'écran reste à peu près **constant** — de quarante à
soixante-quinze —, et c'est précisément ce qui rend la révélation progressive :
la fenêtre se resserrant, les mêmes places reviennent à des lieux de plus en
plus petits, les préfectures cèdent aux bourgs et les bourgs aux villages.
Laisser ce nombre croître avec le zoom noierait la carte sous les noms.

Le tri se fait **dans le cadre visible**, pas dans le pays entier : zoomé sur
la Bretagne on veut les bourgs bretons, non Marseille et Lyon au motif qu'elles
pèsent plus lourd à l'échelle de la France. La taille du nom et du point dit le
rang du lieu, du chef-lieu au hameau.

Le corpus compte 113 584 localités, jusqu'aux villages d'un millier
d'habitants, réparties en un fichier par pays chargé seulement à l'ouverture de
celui-ci. En deçà, la source n'a plus rien : c'est la limite de la carte, et
elle se voit — au zoom maximal, la campagne est vide parce qu'elle l'est.

### Plusieurs saints au même endroit

Cinq saints sont nés à Alexandrie, cinq à Londres, trois à Rome. Leurs croix se
posent au même pixel, et cliquer en ouvrait une au hasard — la dernière
dessinée. Les repères qui se touchent sont donc **réunis en un seul**, qui
porte le nombre qu'il cache ; le clic ouvre alors une petite liste où l'on
choisit, dans l'ordre des siècles.

Le regroupement se refait à chaque zoom : deux villages voisins se séparent dès
qu'on s'approche assez pour les distinguer. Ceux qui partagent la même ville,
eux, ne se sépareront jamais — c'est précisément pour eux que la liste existe.

Au passage : le nom écrit sous une croix ne se clique plus. Posé sous son
repère, il déborde volontiers sur le médaillon du voisin et happait alors le
clic qui lui était destiné — on visait un groupe de six et l'on ouvrait un
saint isolé.

## Le tiroir

Le panneau de gauche s'ouvre sur un **sommaire** : la liste de ce qu'on peut
faire, une ligne chacun, et rien d'autre. On choisit une partie — Rechercher,
Ajouter, Modération, Assistant, Compte, Paramètres — et elle prend toute la
place, avec un « ‹ Sommaire » pour revenir. Une rangée d'onglets aurait montré
les six parties à la fois en n'en laissant lire aucune ; ici chaque écran ne
dit qu'une chose.

Refermer le tiroir ramène au sommaire : le rouvrir repose la question « que
voulez-vous faire », plutôt que de reprendre là où l'on en était trois clics
plus tôt. « Retour à la carte », en bas du sommaire, referme sans naviguer
ailleurs — la carte reste maîtresse.

## La recherche

Une seule barre. On y écrit ce qu'on a en tête, dans n'importe quel ordre :

```
Italie XIIIe          un pays et un siècle
Espagne 1515          un pays et une année (les saints vivants cette année-là)
4 septembre           une date de fête
Thérèse               un nom, une ville ou un pays
Pologne 17e Bobola    tout à la fois
```

Ce que la barre a reconnu s'affiche en dessous sous forme de jetons — « Italie »,
« 13e siècle » — que l'on retire d'un clic. C'est ce qui rend la recherche
lisible : on voit ce qui a été compris plutôt que de le deviner. Le reste des
mots sert de recherche libre sur le nom, la ville et le pays.

Siècles acceptés en chiffres romains (`XIII`, `XIIIe`) comme en chiffres arabes
(`13e`, `13 siècle`), et les mois sont reconnus dans la langue affichée comme
en anglais. Le patronage entre dans l'index : `animaux` ramène François
d'Assise, `aveugles` Lucie de Syracuse.

### Exporter les fêtes vers un agenda

Sous le compte des résultats, un bouton verse la liste affichée dans un
fichier `.ics` — un événement annuel par fête, avec le lieu et la notice.
Il porte sur ce qui est à l'écran : sans filtre, les 285 saints ; après
« Italie XIIIe », ces cinq-là seulement. Le fichier s'ouvre dans n'importe
quel agenda, sans compte ni service tiers.

## Comptes et permissions

| Rôle | Peut |
| --- | --- |
| **Visiteur** | Naviguer et rechercher. |
| **Utilisateur** | En plus : proposer des saints, soumis à validation. |
| **Administrateur** | En plus : ajouter, modifier, supprimer, et approuver ou refuser les propositions. |

Le rôle se choisit dans la partie **Compte** du tiroir. Le code administrateur au premier
lancement est `sanctimaps` ; l'application signale tant qu'il n'a pas été
changé, ce qui se fait depuis le même onglet.

> **Ce n'est pas un dispositif de sécurité.** Le contrôle des rôles s'exécute
> dans le navigateur du visiteur, qui peut toujours le contourner par la
> console ; le serveur fourni distribue les fichiers et porte les appels au
> modèle, mais ne vérifie aucun rôle. Ce partage sépare les usages et évite les
> fausses manœuvres ; il ne protège pas des données. Une véritable autorisation
> demanderait que le serveur tienne les comptes et arbitre chaque écriture.

Une fiche proposée par un utilisateur part **en attente** : elle apparaît
marquée comme telle, reste invisible aux visiteurs, et la partie **Modération**
la signale à l'administrateur par un compteur. Celui-ci l'approuve — elle est
alors publiée — ou la refuse.

## L'assistant de propositions

La partie **Assistant**, réservée à l'administrateur, sert à verser des saints
plus vite. Elle a deux sources et un seul circuit.

**Autonome** — la source par défaut, et celle qui ne dépend de personne. Sans
compte, sans clé, sans réseau, sans modèle : elle puise dans **148 fiches**
écrites à la main et livrées avec l'application, les passe aux mêmes contrôles
que le reste, et propose celles qui passent. C'est l'assistant qui fonctionne
tout seul, y compris sur une machine hors ligne.

Les fiches sont dans `data/candidats/*.json`, un objet par ligne. En ajouter
est le moyen d'étoffer l'assistant sans rien brancher : la génération les
reprend, la vérification s'applique, l'administrateur tranche. On n'y met que
des vies bien attestées et des lieux de naissance sur lesquels les sources
s'accordent — mieux vaut une liste plus courte qu'une fiche à corriger.

**Modèle externe** — la seconde source, facultative. Elle demande à un modèle
des fiches complètes — noms en trois langues, dates, lieu de naissance,
coordonnées, fête, qualités, notice, patronage et biographie — pour une région
et un siècle que vous choisissez. Une fiche
acceptée est publiable telle quelle : c'est tout l'intérêt, l'administrateur
relit au lieu de saisir.

### Choisir son modèle, si l'on en veut un

Cette section ne concerne que la seconde source. La première n'a besoin de
rien. **L'assistant n'est lié à aucun fournisseur.** Trois façons de parler à un
modèle sont prévues, et elles couvrent à peu près tout ce qui existe :

| `AI_PROVIDER` | Ce que c'est | Clé |
| --- | --- | --- |
| `ollama` | Un modèle sur **votre machine**. Rien ne sort, rien n'est facturé. | aucune |
| `openai` | Tout service parlant le dialecte « chat completions » : OpenAI, Mistral, Groq, Together, DeepSeek, OpenRouter — ou votre propre serveur : vLLM, LM Studio, llama.cpp, LocalAI. | selon le service |
| `anthropic` | L'API de Claude. | oui |

```bash
# Sur votre machine, sans compte ni clé
AI_PROVIDER=ollama AI_MODEL=llama3.1 npm start

# Un service compatible OpenAI, ici Mistral
AI_PROVIDER=openai AI_BASE_URL=https://api.mistral.ai/v1 \
  AI_API_KEY=… AI_MODEL=mistral-large-latest npm start

# Un serveur que vous hébergez, LM Studio par exemple
AI_PROVIDER=openai AI_BASE_URL=http://127.0.0.1:1234/v1 AI_API_KEY=x npm start
```

`AI_BASE_URL` et `AI_MODEL` ont un défaut par fournisseur ; `AI_API_KEY` n'est
lue que si le service en réclame une. Sans `AI_PROVIDER`, l'application déduit
du reste de l'environnement — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`OLLAMA_HOST` — et se tait si elle ne trouve rien.

L'assistant affiche le service en fonction avant chaque appel, et dit s'il est
**sur votre machine** ou **distant** : la différence compte, pour ce que vous
envoyez comme pour ce que vous payez. La clé, quand il en faut une, reste sur
la machine qui lance le serveur ; c'est lui qui parle au service, jamais la
page. Sans fournisseur, l'assistant le dit et le réservoir reste disponible.

Ajouter un quatrième fournisseur tient en une trentaine de lignes dans
`tools/providers.mjs` : une adresse, un en-tête, la façon de réclamer du JSON
structuré, et l'endroit où lire la réponse.

**Les deux sources passent par la même vérification**, et c'est elle qui fait le
travail de fond :

- un saint du même nom figure-t-il déjà au corpus ?
- une fiche occupe-t-elle déjà ce lieu à la même date de fête, sous un nom qui
  se recoupe ? (deux compagnons martyrisés le même jour au même endroit ne
  sont pas un doublon — il faut que les noms concordent)
- le pays déclaré existe-t-il sur la carte ?
- le point tombe-t-il bien à l'intérieur de ce pays ?
- les dates de naissance et de mort sont-elles cohérentes ?
- la date de fête est-elle possible ?

Seules les fiches qui passent tout sont proposées ; l'administrateur les
accepte ou les passe. Les autres sont montrées à part **avec le motif exact de
leur mise à l'écart** — c'est ce qui rend la vérification vérifiable. Le
réservoir contient d'ailleurs quatre fiches volontairement fautives, une par
type d'erreur, pour que ce tri se voie à l'usage : sur 148 fiches, 144 sont
proposées et ces quatre-là sont écartées, chacune avec son motif. Elle vaut d'autant plus
qu'un petit modèle local se trompe plus souvent qu'un grand modèle distant :
c'est le prix de l'indépendance, et le filet est fait pour ça.

> **Ce que le modèle affirme n'est pas une garantie.** Il indique lui-même sa
> certitude sur chaque fiche, et la vérification arrête les erreurs
> mécaniques — pays inventé, point tombé sur un autre continent, doublon,
> dates impossibles. Elle n'arrête pas une erreur historique plausible : c'est
> à l'administrateur de lire avant d'accepter. Rien n'est publié sans lui.

## Langues

Douze langues : français, anglais, espagnol, italien, portugais, allemand,
néerlandais, polonais, russe, arabe (avec passage en écriture de droite à
gauche), chinois et latin. Les noms de pays, les mois et les nombres suivent
la langue choisie ; les qualités des saints s'accordent au genre lorsque la
langue le demande.

## Thème

Trois états, en bas du panneau : **système** suit le réglage du navigateur,
**clair** et **sombre** l'emportent dessus. Le choix est retenu sur l'appareil
et posé avant le premier rendu, pour qu'un écran clair ne vire pas au sombre
sous les yeux du lecteur.

## Les données

285 saints répartis sur 57 pays et les six continents, avec pour chacun ses
noms (français, anglais, latin), ses dates, son lieu de naissance rapporté au
pays d'aujourd'hui, sa fête et une notice d'une phrase. S'y ajoutent 93 fiches
candidates en réserve pour l'assistant.

153 de ces saints portent en plus un patronage — ce dont ils sont patrons —
tenu à part dans `data/saints/patronages.json` et fusionné à la génération.
Seuls les patronages bien attestés y figurent : un saint sans entrée n'affiche
simplement pas la ligne « Saint patron de », ce qui vaut mieux qu'un patronage
inventé pour remplir la case.

Le lieu retenu est celui de la **naissance**, situé dans le pays actuel : Édith
Stein est née à Breslau, donc en Pologne ; Ambroise de Milan à Trèves, donc en
Allemagne. Les dates antérieures au haut Moyen Âge sont souvent traditionnelles
plutôt qu'établies ; elles sont alors marquées « vers ».

Le corpus est déséquilibré, et c'est fidèle : 190 saints en Europe contre deux
en Océanie. C'est la géographie réelle des canonisations, pas une lacune de
collecte.

### Où vivent les modifications

Le corpus livré est en lecture seule. Tout ce que l'utilisateur ou
l'administrateur fait — ajouts, retouches, suppressions — vit dans une couche
locale (`localStorage`) posée par-dessus, et n'existe que dans ce navigateur.
La partie **Modération** en donne le décompte et permet de tout réinitialiser
d'un geste ; les fiches ajoutées s'exportent en JSON depuis la partie
**Ajouter**.

### Modifier ou enrichir le corpus

Les fiches sont réparties par aire géographique dans `data/saints/*.json`, et
le réservoir de l'assistant dans `data/candidats/*.json`, un objet par ligne
pour rester lisibles en revue. Après toute modification :

```bash
npm install          # une fois, pour les jeux de données sources
npm run build:data   # revalide et régénère data/generated/
npm run check        # contrôles de cohérence
```

`build:data` refuse d'écrire si une fiche du corpus est incomplète :
identifiant en double, pays inconnu, fête mal formée, coordonnées hors
limites, mort avant la naissance. Le réservoir de candidats échappe à cette
validation — c'est l'assistant qui doit la faire, sous les yeux de
l'administrateur.

## Organisation

```
index.html               page unique
src/css/app.css          feuille de style unique (thème clair et sombre)
src/js/main.js           assemblage et navigation
src/js/data.js           corpus, couche locale, index, siècles
src/js/auth.js           rôles et permissions
src/js/query.js          analyse de la barre de recherche unique
src/js/verify.js         contrôles de l'assistant
src/js/ai.js             appels à l'assistant intelligent, côté navigateur
src/js/calendar.js       export des fêtes au format iCalendar
src/js/theme.js          thème système, clair ou sombre
src/js/basemap.js        fond de tuiles : adresse, mention de source, réglage
src/js/i18n.js           langues, dates, nombres, accords en genre
src/js/locales/*.js      douze paquets de traductions
src/js/map/projection.js projection Mercator, partagée avec la génération
src/js/map/view.js       rendu SVG, cadrages, zoom et déplacement bornés
src/js/ui/*.js           panneau, recherche, fiche, formulaire, modération,
                         assistant, compte, bandeau
data/saints/*.json       corpus, écrit à la main
data/saints/patronages.json  patronages, indexés par identifiant
data/candidats/*.json    réservoir de l'assistant
data/generated/          données produites par build:data (versionnées)
tools/ai.mjs             consigne et schéma des fiches, côté serveur
tools/providers.mjs      adaptateurs de fournisseur (openai, ollama, anthropic)
tools/build-data.mjs     génération des données
tools/check-data.mjs     contrôles de cohérence
tools/serve.mjs          serveur : fichiers statiques et endpoint de l'IA
```

### Ce que fait la génération

`tools/build-data.mjs` lit trois jeux de données installés en
`devDependencies` — jamais téléchargés à l'exécution — et en tire tout ce que
l'application consomme :

- **world-atlas** fournit les contours des pays. Ils sont projetés une fois
  pour toutes en Mercator dans un carré de 10⁶ unités, puis écrits en chemins
  SVG à coordonnées relatives. Le tracé léger (110m) sert à la vue mondiale, le
  tracé fin (50m) est chargé à la volée quand on ouvre un pays.
- **world-countries** donne les codes ISO, le rattachement à un continent et
  les noms de pays traduits.
- **all-the-cities** fournit jusqu'à 2 500 localités par pays, capitale en tête.

Trois détails de cartographie méritent d'être signalés :

- Les continents sont cadrés à la main, en degrés, plutôt que déduits de leurs
  pays membres : la Russie étant rattachée à l'Europe par la norme ISO, l'union
  brute des territoires étirerait la vue « Europe » jusqu'au Kamtchatka.
- L'Océanie franchit l'antiméridien. Elle est décrite dans un repère centré
  Pacifique, et les tracés qui débordent le carré Mercator sont redoublés un
  tour de globe plus loin, pour qu'aucun morceau de carte ne manque.
- Le monde est coupé à 79° nord. Au-delà, Mercator étire un océan Arctique vide
  sur près d'un sixième de la hauteur ; cette bande rendue à la carte est la
  place que gagnent tous les continents habités.

Le cadrage d'un pays vise sa masse principale et ce qui la borde : ouvrir la
France montre la métropole et la Corse, pas l'Atlantique jusqu'à la Guyane.

## Accessibilité

Les 234 tracés de pays ne sont pas dans l'ordre de tabulation : les y mettre
rendrait le parcours au clavier inutilisable. L'accès sans souris passe par la
recherche, le fil d'Ariane et les puces de continents ; les points de naissance
des saints, eux, sont focalisables et s'ouvrent avec `Entrée`.

## Sources

- Contours : [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, domaine public)
- Métadonnées des pays : [world-countries](https://github.com/mledoze/countries) (ODbL)
- Villes : [all-the-cities](https://github.com/zeke/all-the-cities) (GeoNames, CC BY 4.0)
