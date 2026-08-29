# SanctiMaps

Carte mondiale interactive des saints de l'Église catholique. L'application
s'ouvre directement sur le planisphère : on choisit un continent, puis un pays,
et le pays se déploie à l'écran avec ses villes principales et les lieux de
naissance des saints qui y sont nés.

## Démarrer

```bash
npm install     # uniquement pour régénérer les données (voir plus bas)
npm start       # http://localhost:8080
```

L'application est un site statique : aucun outil de compilation, aucune
bibliothèque chargée depuis un CDN, aucune requête réseau à l'exécution. Il
suffit de servir le dossier avec n'importe quel serveur de fichiers ;
`npm start` en fournit un, sans dépendance.

## Comment on navigue

Les trois échelles de lecture s'enchaînent, et chacune fixe ce qui est possible :

| Échelle | Ce que l'on voit | Ce que l'on peut faire |
| --- | --- | --- |
| **Monde** | Les six continents. Les pays comptant des saints sont d'une autre couleur. | Choisir un continent — le zoom est verrouillé. |
| **Continent** | Les pays du continent, nommés et comptés. | Choisir un pays — le zoom reste verrouillé. |
| **Pays** | Le pays entier à l'écran, ses villes principales et un point par saint. | Zoomer, se déplacer, ouvrir la fiche d'un saint. |

Le déplacement est borné à chaque échelle : on ne peut pas dériver
indéfiniment hors de la carte. Un clic sur la mer, ou la touche `Échap`,
remonte d'un niveau ; le fil d'Ariane et les puces de continents permettent
d'aller directement où l'on veut.

## Le panneau de gauche

- **Rechercher** — par nom (le sien, celui de sa ville ou de son pays), par
  époque, par pays, et par date de fête (mois et jour). Les résultats se
  trient par nom, par chronologie ou par date de fête ; ouvrir un résultat
  amène la carte sur le pays concerné et met le point en évidence.
- **Ajouter** — un formulaire pour inscrire un saint absent de la carte. Les
  coordonnées se saisissent à la main ou se pointent directement sur la carte,
  auquel cas le pays est reconnu tout seul. Les fiches ajoutées restent sur
  l'appareil (`localStorage`), s'affichent en vert et sont exportables en JSON.
- **Langue** — douze langues : français, anglais, espagnol, italien,
  portugais, allemand, néerlandais, polonais, russe, arabe (avec passage en
  écriture de droite à gauche), chinois et latin. Les noms de pays et les mois
  suivent la langue choisie.

## Les données

285 saints répartis sur 57 pays et les six continents, avec pour chacun ses
noms (français, anglais, latin), ses dates, son lieu de naissance rapporté au
pays d'aujourd'hui, sa fête et une notice d'une phrase.

Le lieu retenu est celui de la **naissance**, situé dans le pays actuel : Édith
Stein est née à Breslau, donc en Pologne ; Ambroise de Milan à Trèves, donc en
Allemagne. Les dates antérieures au haut Moyen Âge sont souvent traditionnelles
plutôt qu'établies ; elles sont alors marquées « vers ».

### Modifier ou enrichir le corpus

Les fiches sont réparties par aire géographique dans `data/saints/*.json`,
un objet par ligne pour rester lisible en revue. Après toute modification :

```bash
npm run build:data   # revalide et régénère data/generated/
npm run check        # contrôles de cohérence
```

`build:data` refuse d'écrire si une fiche est incomplète : identifiant en
double, pays inconnu, fête mal formée, coordonnées hors limites, mort avant la
naissance.

## Organisation

```
index.html               page unique
src/css/app.css          feuille de style unique (thème clair et sombre)
src/js/main.js           assemblage et navigation
src/js/data.js           chargement, index, fiches personnelles
src/js/i18n.js           langues, dates, nombres, accords en genre
src/js/locales/*.js      douze paquets de traductions
src/js/map/projection.js projection Mercator, partagée avec la génération
src/js/map/view.js       rendu SVG, cadrages, zoom et déplacement bornés
src/js/ui/*.js           panneau, recherche, fiche, formulaire, bandeau
data/saints/*.json       corpus, écrit à la main
data/generated/          données produites par build:data (versionnées)
tools/build-data.mjs     génération des données
tools/check-data.mjs     contrôles de cohérence
tools/serve.mjs          serveur statique de développement
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
- **all-the-cities** fournit jusqu'à quatorze villes par pays, capitale en tête.

Deux détails de cartographie méritent d'être signalés :

- Les continents sont cadrés à la main, en degrés, plutôt que déduits de leurs
  pays membres : la Russie étant rattachée à l'Europe par la norme ISO, l'union
  brute des territoires étirerait la vue « Europe » jusqu'au Kamtchatka.
- L'Océanie franchit l'antiméridien. Elle est décrite dans un repère centré
  Pacifique, et les tracés qui débordent le carré Mercator sont redoublés un
  tour de globe plus loin, pour qu'aucun morceau de carte ne manque.

Le cadrage d'un pays vise sa masse principale et ce qui la borde : ouvrir la
France montre la métropole et la Corse, pas l'Atlantique jusqu'à la Guyane.

## Sources

- Contours : [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, domaine public)
- Métadonnées des pays : [world-countries](https://github.com/mledoze/countries) (ODbL)
- Villes : [all-the-cities](https://github.com/zeke/all-the-cities) (GeoNames, CC BY 4.0)
