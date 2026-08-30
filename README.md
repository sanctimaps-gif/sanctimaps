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
chargée depuis un CDN, aucune requête réseau pour l'afficher. Deux choses
seulement sortent sur le réseau, et l'une comme l'autre est faite pour pouvoir
manquer : le fond de rues sous la vue pays, qui se coupe d'un réglage, et la
recherche de l'assistant sur Wikidata, qui ne part que si l'administrateur la
demande. Le serveur ne sert qu'à deux choses : distribuer les fichiers, et — si un fournisseur de
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

Au monde, un cartouche annonce l'étendue du corpus — « 4 520 saints recensés
dans 91 pays » — avant même le premier clic. Il s'efface dès qu'on descend
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
faire, une ligne chacun, et rien d'autre. On choisit une partie — Saint du
jour, Rechercher, Ajouter, Modération, Assistant, Paramètres — et elle prend
toute la place, avec un « ‹ Sommaire » pour revenir. Une rangée d'onglets
aurait montré les six parties à la fois en n'en laissant lire aucune ; ici
chaque écran ne dit qu'une chose.

**Paramètres** réunit ce qui se règle et ce qui vous identifie : affichage
(langue, thème, fond de carte), rappel quotidien, puis compte. Deux entrées du
sommaire pour six champs, c'était une porte de trop.

Refermer le tiroir ramène au sommaire : le rouvrir repose la question « que
voulez-vous faire », plutôt que de reprendre là où l'on en était trois clics
plus tôt. « Retour à la carte », en bas du sommaire, referme sans naviguer
ailleurs — la carte reste maîtresse.

## Le saint du jour

La première entrée du sommaire, parce que c'est la question qu'on se pose en
ouvrant : **qui fête-t-on aujourd'hui ?** Le calendrier des saints est
perpétuel — la fête revient au même jour tous les ans, l'année ne compte pas —,
si bien que la partie ne fait rien d'autre que lire l'horloge de la machine et
ramener les fiches qui portent cette date. Aucun réglage, aucune requête.

La date s'écrit en grand, dans la langue courante, et les saints du jour se
présentent comme des résultats de recherche : un clic ouvre la fiche, et la
fiche mène à la carte. Deux boutons feuillettent la veille et le lendemain, un
troisième revient à aujourd'hui.

**Les jours vides le disent.** Depuis l'import de Wikidata il n'en reste
qu'un : le 29 février, que le corpus ne pourvoit pas encore. Avant cet import,
les 285 fiches écrites à la main n'en couvraient que 216 sur 366. Plutôt qu'un
écran blanc, la partie cherche la prochaine date pourvue et propose d'y aller
d'un bouton — un vide qui indique la sortie vaut mieux qu'un vide qui se tait.
Une ligne finale donne le compte, pour que l'état du corpus soit lu là où son
manque se ressent.

### Être prévenu chaque jour

Dans **Paramètres → Rappel quotidien**, deux chemins — et ils ne valent pas la
même chose. Le dire est la moitié du réglage :

| | Ce que ça fait | Ce que ça vaut |
| --- | --- | --- |
| **Calendrier du téléphone** | Produit un fichier `.ics` : un événement par jour pourvu — 365 aujourd'hui —, répétés tous les ans, chacun avec une alarme à l'heure choisie. | **C'est le chemin qui atteint vraiment le téléphone.** Une fois le fichier ouvert sur l'appareil, c'est l'agenda qui prévient — hors ligne, sans compte, sans que l'application soit ouverte. |
| **Notification du navigateur** | Demande la permission, puis annonce le saint du jour à l'heure dite. | Seulement **tant que cette page est ouverte**. |

Un site statique n'a derrière lui ni serveur ni service de notification : il
n'a aucun moyen de réveiller un appareil éteint, et prétendre le contraire
serait mentir. Le calendrier, lui, le peut, parce que c'est le téléphone qui
garde les événements et déclenche l'alarme.

L'heure est écrite en temps *flottant* — ni `Z`, ni fuseau : la notification
tombe à sept heures là où l'on se trouve, et non à sept heures de Paris quand
on est à Montréal.

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
Il porte sur ce qui est à l'écran : sans filtre, le corpus entier ; après
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
plus vite. Elle a trois sources et un seul circuit — et **les deux premières ne
demandent rien à personne** : ni compte, ni clé, ni réseau, ni modèle.

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

**Expert** — la seconde source, elle aussi sans modèle. Elle part d'un constat :
ce que faisait le modèle de langue tenait en trois choses très différentes.
**Savoir** qu'un saint existe et ce qu'il fut ; **raconter** sa vie ; **placer**
son lieu sur la carte. Les deux premières demandent une mémoire, la troisième
une table — mais une mémoire écrite une fois pour toutes est une table comme
une autre.

L'application en emporte donc deux, et l'expert ne fait rien d'autre que les
consulter :

| Fond | Contenu | Ce qu'il rend |
| --- | --- | --- |
| `data/reference/fond-*.json` | 148 fiches rédigées pour ce fond | dates, fête, qualités, patronage, notice, histoire, lieu de naissance **et lieu de mort** |
| `data/candidats/*.json` | 145 fiches du réservoir, reprises à la génération | la même chose, sans l'histoire rédigée |
| `data/generated/cities/` | 113 584 localités | les coordonnées exactes du lieu |

Soit **293 noms** que l'atelier remplit d'un clic. Le réservoir de la source
autonome entre dans le fond parce que rien ne justifie de faire ressaisir à la
main ce qui est déjà écrit deux dossiers plus loin ; ses fiches n'ont
simplement pas d'histoire rédigée, et l'atelier laisse alors le champ vide
plutôt que de l'inventer. Les quelques fiches volontairement fautives du
réservoir — celles qui servent à démontrer la vérification — n'y entrent pas :
la génération les écarte au même titre que le contrôle.

Vous tapez le nom du saint, vous cliquez sur « Chercher ce saint », et
l'atelier se remplit : la fiche entière descend du premier fond, la ville
descend au second qui en tire les coordonnées, et il ne vous reste qu'à
relire avant de composer. C'est là qu'on gagne du temps : la fiche complète
d'un saint représentait une dizaine de champs à saisir un par un.

Trois précisions, parce qu'elles font la différence entre un index et un
modèle :

- **Le lieu de mort.** Un saint peut naître d'un côté du monde et mourir de
  l'autre — Jacques Laval naît en Normandie et meurt à Maurice. La carte ne
  portant qu'un point, une bascule laisse choisir lequel, et la fiche publiée
  dit alors « lieu de mort » plutôt que « lieu de naissance ».
- **Les graphies.** La table ne connaît qu'un nom par lieu, tantôt local
  (`Assisi`), tantôt anglais (`Rome`, `Florence`). Un fichier de correspondances,
  `data/reference/exonymes.json`, dit que « Assise », « Roma » et « Florence »
  désignent la même chose : on peut chercher dans la langue où l'on pense.
  Rien n'y est deviné, chaque correspondance est écrite, et `npm run check`
  vérifie que le nom de droite existe vraiment dans le pays.
- **Les hameaux.** La table s'arrête aux lieux qu'elle recense ; une trentaine
  de villages du fond y échappent, Siviriez ou Barfleur par exemple. Ce sont
  alors les coordonnées de la fiche qui servent, et l'atelier l'annonce au lieu
  de le taire.

Quand le nom est ambigu, il rend les lieux possibles avec leur population et
vous choisissez : « Saint-Pierre » propose d'abord la commune qui porte
exactement ce nom, puis les huit premières des composées. Et quand le saint est
déjà sur la carte, il le dit avant le travail plutôt qu'après la vérification.

#### Quand les fonds livrés ne savent pas : Internet

Un nom absent des deux fonds ne s'arrête plus là. L'assistant interroge alors
**Wikidata** pour les faits et **Wikipédia** pour le récit — directement depuis
le navigateur, sans serveur intermédiaire, sans clé et sans compte : les deux
services acceptent les requêtes d'origine tierce, ce qui laisse l'application
entièrement statique. Le bouton « Chercher sur Internet » permet aussi de le
demander expressément.

Ce que Wikidata rend, et où l'atelier le verse :

| Propriété | Champ de la fiche |
| --- | --- |
| `P569` / `P570` | années de naissance et de mort |
| `P19` / `P20` → `P625` | ville et coordonnées, naissance **et** mort |
| `P19` → `P17` → `P298` | pays, en code à trois lettres |
| `P841` | date de fête |
| `P2925` | patronage |
| `P106`, `P39` | qualités |
| lien vers Wikipédia | histoire du saint |

L'import de masse fait de même : il joint à chaque fiche l'**introduction de
l'article de Wikipédia**, réduite à trois phrases, coupée en fin de phrase et
plafonnée à six cents caractères. Le texte est sous licence CC BY-SA, et
l'adresse de l'article rejoint donc les sources de la fiche. Les titres sont
demandés par vingt à l'API de MediaWiki, dans les deux langues ; les
redirections et les titres normalisés sont rendus à la fiche qui les avait
demandés, faute de quoi une biographie irait au mauvais saint. Sur les 4 235
fiches importées, 3 471 en ont reçu une.

Le choix de la source n'est pas indifférent. Un modèle de langue restitue ses
souvenirs et se trompe avec assurance ; Wikidata rend des champs structurés,
datés et **sourcés**. Chaque fiche composée ainsi garde l'adresse de ce qui l'a
nourrie, affichée dans l'atelier puis sur la fiche publiée. Ce n'est pas un
ornement : le texte de Wikipédia est sous licence CC BY-SA, et l'attribution
voyage avec lui.

Trois garde-fous, parce qu'une source ouverte n'est pas une source sûre :

- **Seuls les êtres humains datés sont retenus.** Chercher « Odilon » ramène
  aussi l'église Saint-Odilon ; l'atelier écarte ce qui n'est pas une personne
  (`P31` ≠ `Q5`) et ce dont on ne sait ni la naissance ni la mort.
- **Les six contrôles s'appliquent comme au reste.** Une fiche venue d'Internet
  passe par le même crible que les autres, et l'administrateur tranche toujours.
- **L'atelier le rappelle** : Wikidata et Wikipédia s'écrivent à plusieurs
  mains, la fiche se relit avant d'être publiée.

Internet coupé, service muet, requête bloquée : l'atelier le dit en une phrase
et le fond livré avec l'application reste entier. C'est la deuxième chose de
l'application qui sorte sur le réseau, après le fond de tuiles, et comme lui
elle est faite pour pouvoir manquer.

Ce qu'il ne fait pas, et ne prétend pas faire : connaître les saints qui ne
sont ni dans les deux fonds livrés ni sur Wikidata. Il le dit alors, et laisse
l'atelier ouvert à la saisie manuelle — ce qu'il ne sait pas, il ne le comble
pas. Un état des
lieux tiré du corpus ferme l'atelier — combien de saints, dans combien de pays,
quel continent est le moins pourvu, combien de fiches attendent un patronage —
pour dire où porter l'effort suivant.

**Modèle externe** — la troisième source, facultative, et **la seule qui sorte
de la machine**. Elle n'apparaît que si un fournisseur est configuré : un
onglet qui n'afficherait qu'un message d'indisponibilité n'est pas un choix,
c'est une impasse. Elle demande à un modèle des fiches complètes — noms en trois langues, dates, lieu de naissance,
coordonnées, fête, qualités, notice, patronage et biographie — pour une région
et un siècle que vous choisissez. Une fiche
acceptée est publiable telle quelle : c'est tout l'intérêt, l'administrateur
relit au lieu de saisir.

### Choisir son modèle, si l'on en veut un

Cette section ne concerne que la troisième source. Les deux premières n'ont
besoin de rien. **L'assistant n'est lié à aucun fournisseur.** Trois façons de parler à un
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

**4 520 saints répartis sur 91 pays** et les six continents, avec pour chacun
ses noms (français, anglais, latin quand il existe), ses dates, son lieu de
naissance rapporté au pays d'aujourd'hui, sa fête et souvent une notice. Deux
origines s'y mêlent :

| | | |
| --- | ---: | --- |
| Écrits à la main | 285 | notice rédigée, patronage attesté, latin systématique |
| Importés de Wikidata | 4 235 | l'adresse de l'élément d'origine accompagne chaque fiche |

S'y ajoutent 148 fiches candidates en réserve pour l'assistant et 293 fiches
de fond documentaire.

**3 471 fiches sur 4 520 — 77 % — portent une biographie**, c'est-à-dire un
récit de quelques phrases sous les dates, et non la seule notice d'une ligne.
2 951 viennent de l'article français de Wikipédia, 3 108 de l'anglais, la
plupart des deux ; l'introduction est réduite à trois phrases, coupée en fin de
phrase et plafonnée à six cents caractères, ce qui donne 293 caractères en
moyenne. Les 1 049 fiches restantes sont celles dont le saint n'a d'article
dans aucune des deux langues : la fiche se tait alors plutôt que d'inventer.
L'attribution CC BY-SA voyage avec le texte, dans les sources de la fiche.

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

### Importer en masse depuis Wikidata

Le corpus écrit à la main compte 285 fiches ; l'import de Wikidata en a
ajouté **4 235**, portant la carte à **4 520 saints dans 91 pays**. L'outil
verse d'un coup ce que Wikidata sait de plaçable :

**Sans rien installer, depuis GitHub.** Onglet **Actions** du dépôt →
*Importer les saints depuis Wikidata* → **Run workflow**. Le travail se fait
sur une machine de GitHub, les contrôles s'appliquent, et le résultat est versé
au dépôt — ce qui redéploie le site. Quatre réglages facultatifs : un nombre
maximal de fiches, un statut de canonisation, une liste de pays, la taille des
lots. Le déclenchement est manuel à dessein : un import quotidien réécrirait le corpus
sans que personne regarde, et Wikidata bouge.

**En ligne de commande**, si l'on préfère :

```bash
npm run import:saints                              # tout ce qui est plaçable
node tools/import-saints.mjs --dry-run             # compter sans rien écrire
node tools/import-saints.mjs --limit 200           # un échantillon, pour voir
node tools/import-saints.mjs --status saint        # les canonisés seulement
node tools/import-saints.mjs --names ma-liste.txt  # seulement ces noms-là
node tools/import-saints.mjs --countries FRA,ITA   # seulement ces pays-là
node tools/import-saints.mjs --no-bios             # sans les biographies
npm run build:data && npm run check                # puis, toujours
```

L'import lui-même n'a besoin que de Node ; `npm install` ne sert qu'à
`build:data`, qui régénère les données géographiques.

**Pourquoi Wikidata, quand on dispose de listes de saints.** Une carte a besoin
de coordonnées. Les listes de noms — celle de Wikipédia, celle de Nominis,
celle de Vie chrétienne — n'en portent pas : elles donnent un nom, parfois un
siècle, jamais un point. Wikidata, si, et c'est la même connaissance sous une
forme que la machine peut lire.

S'y ajoute une raison de droit. Wikidata est en CC0 et Wikipédia en CC BY-SA,
l'une et l'autre réutilisables — la seconde à condition de citer, ce que chaque
fiche importée fait. Les notices de **Nominis** (Conférence des évêques de
France) et de **Vie chrétienne** sont, elles, protégées : leurs textes ne
peuvent pas être versés ici. Leurs listes de noms restent utiles comme
pense-bête, et `--names` sert exactement à cela : on colle les noms dans un
fichier, l'outil ne remonte que ceux-là, en allant chercher les faits là où ils
sont réutilisables.

**Ce qui entre, et ce qui n'entre pas.** N'entre que ce qui est plaçable et
vérifiable : un statut de canonisation (`P411`), un lieu de naissance pourvu de
coordonnées, un pays que la carte connaît, une fête bien formée, au moins une
année, et un point qui tombe dans le cadre de son pays. Tout le reste est
compté et annoncé à l'écran, non deviné :

```
2999 fiches retenues.
Écartées :
  doublon    1
  pays       1
  cadre      2
```

Le total importé sera donc toujours inférieur au nombre de saints que l'Église
reconnaît. La différence, ce sont les fiches dont on ignore où poser la croix —
et une carte ne peut pas les porter.

Une fiche écrite à la main l'emporte toujours sur une fiche importée : à nom
égal, l'import cède. Le fichier produit, `data/saints/wikidata.json`, est
réécrit à chaque passage et ne se corrige donc pas à la main ; une correction
durable se fait dans les fichiers rédigés.

### Donner une biographie aux fiches écrites à la main

L'import connaît l'identifiant Wikidata de chaque fiche qu'il fabrique :
l'article s'en déduit sans risque. Les 285 fiches écrites à la main font le
chemin inverse — elles portent un nom, des dates et une fête, mais aucun
identifiant. Ce sont pourtant les plus regardées : les apôtres, Marie, Joseph,
François d'Assise. Un second outil les apparie et leur rapporte leur récit.

```bash
npm run enrich:bios                       # apparier et rapporter
node tools/enrich-bios.mjs --dry-run      # apparier et compter, sans écrire
node tools/enrich-bios.mjs --limit 20     # un échantillon, pour voir
npm run build:data && npm run check       # puis, toujours
```

Depuis GitHub, c'est l'atelier *Donner une biographie aux fiches écrites à la
main*, dans l'onglet **Actions**, avec les mêmes contrôles et le même versement
au dépôt que l'import.

**L'appariement est méfiant, et il le faut.** Chercher « Sébastien » sur
Wikidata ramène aussi bien le martyr que d'autres Sébastien : une biographie
mal attribuée mettrait le récit d'un autre sous le nom du saint, et sur les
fiches les plus lues. Mieux vaut cent fiches sans récit qu'une fiche avec le
mauvais. Trois garde-fous :

- **Le statut de canonisation (`P411`) est exigé** — la propriété ne s'applique
  qu'aux saints, bienheureux et vénérables.
- **Le nom ne suffit jamais.** Il faut en plus une concordance : la même date
  de fête (trois points), ou une année de naissance ou de mort à cinq ans près
  (deux points chacune). Le nom exact ne vaut qu'un point — il est ce qui a
  amené le candidat, il ne peut pas le confirmer. Il faut trois points pour
  entrer.
- **Deux candidats à égalité, c'est un doute, pas un choix.** La fiche reste
  sans biographie et le rapport dit lesquels ont été écartés.

Le résultat va dans `data/saints/biographies.json`, à part des fiches comme les
patronages : une biographie s'ajoute sans qu'il faille rouvrir les huit
fichiers du corpus, et `build:data` fait la jonction. Le fichier est réécrit à
chaque passage — une biographie écrite à la main se met donc dans la fiche
elle-même, où elle a priorité sur celle qui est rapportée.

### Où vivent les modifications

Le corpus livré est en lecture seule. Tout ce que l'utilisateur ou
l'administrateur fait — ajouts, retouches, suppressions — vit dans une couche
locale (`localStorage`) posée par-dessus, et n'existe que dans ce navigateur.
La partie **Modération** en donne le décompte et permet de tout réinitialiser
d'un geste ; les fiches ajoutées s'exportent en JSON depuis la partie
**Ajouter**.

### Modifier ou enrichir le corpus

Les fiches sont réparties par aire géographique dans `data/saints/*.json`, le
réservoir de l'assistant dans `data/candidats/*.json` et son fond documentaire
dans `data/reference/fond-*.json`, un objet par ligne pour rester lisibles en
revue. Après toute modification :

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

Le fond documentaire, lui, est contrôlé plus sévèrement que le reste, parce
qu'il est écrit à la main et qu'une faute y serait invisible à l'écran mais
visible sur la carte : identifiants uniques et distincts du corpus, nom en deux
langues, fête bien formée, dates cohérentes, notice et histoire présentes, et
chacun des deux lieux tombant dans le cadre du pays annoncé. Les graphies de
`exonymes.json` sont vérifiées de même : le nom vers lequel elles pointent doit
exister dans la table de ce pays.

## Organisation

```
index.html               page unique
src/css/app.css          feuille de style unique (thème clair et sombre)
src/js/main.js           assemblage et navigation
src/js/data.js           corpus, couche locale, index, siècles
src/js/auth.js           rôles et permissions
src/js/query.js          analyse de la barre de recherche unique
src/js/verify.js         contrôles de l'assistant
src/js/expert.js         assistant expert : deux fonds tiennent lieu de mémoire
src/js/ai.js             appels à l'assistant intelligent, côté navigateur
src/js/calendar.js       export des fêtes au format iCalendar
src/js/theme.js          thème système, clair ou sombre
src/js/basemap.js        fond de tuiles : adresse, mention de source, réglage
src/js/i18n.js           langues, dates, nombres, accords en genre
src/js/locales/*.js      douze paquets de traductions
src/js/map/projection.js projection Mercator, partagée avec la génération
src/js/map/view.js       rendu SVG, cadrages, zoom et déplacement bornés
src/js/ui/daily.js       saint du jour : l'horloge, le corpus, rien d'autre
src/js/ui/reminder.js    rappel quotidien : agenda du téléphone, notification
src/js/wiki.js           recherche sur Wikidata et Wikipédia, depuis le navigateur
src/js/ui/*.js           panneau, recherche, fiche, formulaire, modération,
                         assistant, compte, bandeau
data/saints/*.json       corpus, écrit à la main
data/saints/patronages.json  patronages, indexés par identifiant
data/candidats/*.json    réservoir de l'assistant
data/reference/fond-*.json   fond documentaire de l'expert, 148 fiches complètes
data/reference/exonymes.json graphies acceptées pour les localités
data/saints/biographies.json biographies rapportées pour les fiches écrites à la main
data/generated/          données produites par build:data (versionnées)
tools/import-saints.mjs  import de masse depuis Wikidata
tools/enrich-bios.mjs    biographies des fiches écrites à la main
tools/lib/wikimedia.mjs  ce que les deux outils Wikimedia ont en commun
.github/workflows/       les deux, lancés d'un clic depuis GitHub
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
