# SanctiMaps

Carte mondiale interactive des saints de l'Église catholique. L'application
s'ouvre directement sur le planisphère : on choisit un continent, puis un pays,
et le pays se déploie à l'écran, où l'on peut zoomer jusqu'aux villages pour
lire les lieux de naissance des saints.

## Démarrer

```bash
npm start                                   # http://127.0.0.1:8080
ANTHROPIC_API_KEY=sk-… npm start            # avec l'assistant intelligent
HOST=0.0.0.0 npm start                      # ouvre l'accès au réseau local
```

Aucune installation n'est nécessaire pour lancer l'application : le serveur
fourni n'utilise que Node. `npm install` ne sert qu'à régénérer les données
(voir plus bas).

La carte est un site statique : aucun outil de compilation, aucune bibliothèque
chargée depuis un CDN, aucune requête réseau pour l'afficher. Le serveur ne
sert qu'à deux choses : distribuer les fichiers, et — si une clé est présente —
porter les appels au modèle sans jamais confier cette clé au navigateur.

## Comment on navigue

Les trois échelles de lecture s'enchaînent, et chacune fixe ce qui est possible :

| Échelle | Ce que l'on voit | Ce que l'on peut faire |
| --- | --- | --- |
| **Monde** | Les continents. Les pays comptant des saints sont d'une autre couleur. | Choisir un continent — le zoom est verrouillé. |
| **Continent** | Les pays du continent, nommés et comptés. | Choisir un pays — le zoom reste verrouillé. |
| **Pays** | Le pays entier à l'écran, ses villes et un point par saint. | Zoomer jusqu'aux villages, se déplacer, ouvrir une fiche. |

Le déplacement est borné à chaque échelle : on ne peut pas dériver
indéfiniment hors de la carte. Un clic sur la mer, ou la touche `Échap`,
remonte d'un niveau ; le fil d'Ariane et les puces de continents permettent
d'aller directement où l'on veut.

En vue pays, plus on zoome, plus la carte descend dans la hiérarchie des
localités : une douzaine de grandes villes au cadrage d'arrivée, puis les
bourgs, puis les villages, jusqu'à environ 450 noms simultanés. Le corpus
compte près de 79 000 localités, réparties en un fichier par pays chargé
seulement à l'ouverture de celui-ci.

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
en anglais.

## Comptes et permissions

| Rôle | Peut |
| --- | --- |
| **Visiteur** | Naviguer et rechercher. |
| **Utilisateur** | En plus : proposer des saints, soumis à validation. |
| **Administrateur** | En plus : ajouter, modifier, supprimer, et approuver ou refuser les propositions. |

Le rôle se choisit dans l'onglet **Compte**. Le code administrateur au premier
lancement est `sanctimaps` ; l'application signale tant qu'il n'a pas été
changé, ce qui se fait depuis le même onglet.

> **Ce n'est pas un dispositif de sécurité.** Le contrôle des rôles s'exécute
> dans le navigateur du visiteur, qui peut toujours le contourner par la
> console ; le serveur fourni distribue les fichiers et porte les appels au
> modèle, mais ne vérifie aucun rôle. Ce partage sépare les usages et évite les
> fausses manœuvres ; il ne protège pas des données. Une véritable autorisation
> demanderait que le serveur tienne les comptes et arbitre chaque écriture.

Une fiche proposée par un utilisateur part **en attente** : elle apparaît
marquée comme telle, reste invisible aux visiteurs, et l'onglet **Modération**
la signale à l'administrateur par un compteur. Celui-ci l'approuve — elle est
alors publiée — ou la refuse.

## L'assistant de propositions

L'onglet **Assistant**, réservé à l'administrateur, sert à verser des saints
plus vite. Il a deux sources et un seul circuit.

**Le réservoir** puise dans des fiches préparées et livrées avec l'application.
Il fonctionne hors ligne et sans rien configurer.

**L'IA** demande au modèle Claude des fiches complètes — noms en trois langues,
dates, lieu de naissance, coordonnées, fête, qualités, notice — pour une région
et un siècle que vous choisissez. Elle s'active en lançant le serveur avec une
clé :

```bash
ANTHROPIC_API_KEY=sk-… npm start
```

La clé reste sur votre machine : c'est le serveur qui parle à l'API, jamais la
page. Sans clé, l'onglet le dit et le réservoir reste disponible. Chaque appel
est facturé par Anthropic.

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
type d'erreur, pour que ce tri se voie à l'usage.

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

## Les données

285 saints répartis sur 57 pays et les six continents, avec pour chacun ses
noms (français, anglais, latin), ses dates, son lieu de naissance rapporté au
pays d'aujourd'hui, sa fête et une notice d'une phrase. S'y ajoutent 93 fiches
candidates en réserve pour l'assistant.

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
L'onglet **Modération** en donne le décompte et permet de tout réinitialiser
d'un geste ; les fiches ajoutées s'exportent en JSON depuis l'onglet
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
src/js/i18n.js           langues, dates, nombres, accords en genre
src/js/locales/*.js      douze paquets de traductions
src/js/map/projection.js projection Mercator, partagée avec la génération
src/js/map/view.js       rendu SVG, cadrages, zoom et déplacement bornés
src/js/ui/*.js           panneau, recherche, fiche, formulaire, modération,
                         assistant, compte, bandeau
data/saints/*.json       corpus, écrit à la main
data/candidats/*.json    réservoir de l'assistant
data/generated/          données produites par build:data (versionnées)
tools/ai.mjs             appel au modèle, côté serveur (porte la clé)
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
