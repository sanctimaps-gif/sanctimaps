# SanctiMaps
<div align="center">

![Logo SanctiMaps](1CA1A404-5F52-4FBF-8F4F-305264E9FC14.png)

# ✝️ SanctiMaps

### La carte mondiale des saints de l'Église catholique

<p>
  Une application interactive qui regroupe les saints de l'Église catholique
  sur une carte mondiale.
</p>

</div>

---

## 🌍 À propos

**SanctiMaps** est une application qui permet d'explorer les saints de
l'Église catholique à travers une **carte mondiale interactive**.

Découvrez les saints selon leur lieu d'origine, leur lieu de vie ou les
lieux associés à leur histoire.

---

## ✨ Fonctionnalités

- 🌍 Carte mondiale interactive
- ✝️ Découverte des saints de l'Église catholique
- 📍 Localisation des saints sur la carte
- 🔎 Recherche de saints
- 📖 Informations sur chaque saint
- 🗺️ Exploration par pays et régions

---

## 🎯 Objectif

Rendre l'histoire et la vie des saints accessibles à tous grâce à une
interface moderne, simple et interactive.

---

## 🚀 SanctiMaps

**Explorez le monde des saints.**

<div align="center">

✝️ 🌍 ✝️

**SanctiMaps — La carte mondiale des saints**

</div>
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

## Une page par saint, lisible sans JavaScript

La carte est une application : elle se peuple en JavaScript, et tout ce qu'elle
montre n'existe qu'une fois le code exécuté. Un moteur de recherche n'avait
donc qu'une page à indexer — l'accueil — pour quatre mille six cents saints, et
chercher « saint Odilon de Cluny » ne menait nulle part ici.

À côté de la carte vivent maintenant **6 256 pages de HTML servi tel quel** :

| | |
| --- | --- |
| `saints/<nom>/` | 4 628 fiches : dates, lieu, fête, biographie, sources |
| `saints/saint-<prénom>/` | 645 prénoms : tous ceux qui le portent |
| `saints/lettre-<x>/` | l'index alphabétique, coupé par initiale |
| `pays/<pays>/` | les saints nés dans ce pays — 91 pages |
| `lieux/<ville>/` | les saints nés là — 523 villes qui en comptent au moins deux |
| `epoques/<n>e-siecle/` | les saints d'un siècle — 27 pages |
| `calendrier/<jour>/` | les saints fêtés ce jour-là — 365 pages |
| `lettre/` | comment recevoir le saint du jour |
| `a-propos/` | ce qu'est SanctiMaps, ce qui lui manque, et où écrire |
| `sitemap.xml`, `robots.txt` | la liste complète, pour qui préfère la lire d'un coup |

**Des adresses sans extension.** Chaque page est l'`index.html` d'un dossier à
son nom : l'adresse s'écrit `sanctimaps.fr/saints/maurice-d-agaune`, et non
`…/maurice-d-agaune.html`. C'est ce qu'on dicte, ce qu'on recopie dans un
message et ce qu'un moteur de recherche montre — et c'est la seule forme qui
marche telle quelle sur n'importe quel hébergement statique, là où l'omission
de l'extension dépend ailleurs de la configuration du serveur. Les anciennes
adresses en `.html` n'ont pas disparu pour autant : **10 079 pages de renvoi**
mènent de chacune à la nouvelle, en `noindex` et avec le lien canonique qui
va — un lien partagé il y a six mois tombe toujours sur la bonne fiche.

**Une page par prénom.** On cherche « saint Maurice », et la carte ne connaît
que « Maurice d'Agaune » : l'adresse qu'on tape ne menait nulle part.
`saints/saint-maurice` existe maintenant, et rassemble les trois Maurice de la
carte — d'Agaune, Duault et Tornay. Quand deux mots précèdent le lieu, le nom
entier fait une adresse de plus : `saints/saint-maurice-tornay` mène droit à sa
fiche. Le genre décide du préfixe — `sainte-therese` pour un prénom que seules
des femmes portent —, et l'autre graphie répond quand même. Un prénom que porte
un seul saint n'a pas de page à lui : son adresse renvoie à la fiche, qui dit
déjà tout ce qu'elle aurait dit.

**Le maillage compte autant que les pages.** Une page isolée n'est jamais
trouvée : chaque fiche renvoie à son pays, à son lieu de naissance, à son jour
de fête et à douze saints voisins ; chaque pays renvoie à ses villes ; chaque
index renvoie aux fiches. Un lecteur — ou un robot — entré
n'importe où parcourt le corpus de proche en proche. Un bandeau en tête de la
carte porte le titre de la page, la phrase qui dit ce qu'est SanctiMaps et les
trois portes vers les index : c'est du texte écrit dans le fichier, non posé
par le code, et c'est par là que tout commence.

**Ce que porte une fiche.** Le nom, la notice, la biographie, les dates, le
lieu de naissance, le pays, la fête, l'époque, les qualités, le patronage, les
sources — et trois choses de plus, qui ne viennent d'aucune source extérieure :

- **une carte de situation**, le contour du pays et un point, dessinée dans la
  page à partir du tracé basse définition et des coordonnées de la fiche. Rien
  n'est chargé, aucun service tiers n'est appelé, pas une ligne de JavaScript
  n'est nécessaire ;
- **le lieu que le nom désigne**, quand ce n'est pas celui de la naissance.
  Nazaire **de Milan** est né à Rome, Pancrace **de Taormine** à Antioche : un
  saint porte presque toujours le nom du lieu où on le vénère, la carte porte
  celui où il est né, et une fiche qui ne nommait que le second avait l'air de
  se contredire ;
- **un paragraphe qui la situe parmi les autres** — combien de saints au même
  endroit, au même jour, au même siècle. Il est tiré du corpus lui-même et ne
  se trouve donc nulle part ailleurs.

Chaque fiche porte son **JSON-LD** (`schema.org/Person` : dates, lieu,
coordonnées, `sameAs` vers Wikidata et Wikipédia) et son fil d'Ariane
(`BreadcrumbList`) ; les pages de liste y ajoutent leur `ItemList`. Chacune a
son adresse canonique et ses balises Open Graph. Le bouton « Voir sur la carte » rouvre l'application sur ce
saint — `index.html?saint=<id>` —, de sorte qu'une page trouvée par un moteur
de recherche mène à la carte plutôt qu'à un cul-de-sac.

Ces pages ne réécrivent rien : tout ce qu'elles disent vient de
`data/generated/saints.json`, dans les mêmes mots que la fiche de la carte,
avec les mêmes sources et la même règle de langue — le français, ou rien. Elles
sont donc régénérées à chaque import et ne se corrigent pas à la main :

```bash
npm run build:pages                          # après tout build:data
node tools/build-pages.mjs --dry-run         # compter sans écrire
node tools/build-pages.mjs --base https://…  # autre adresse publique
```

**Un lieu ne fait une page que s'il porte au moins deux saints** : à un seul,
la page ne dirait rien que sa fiche ne dise déjà, et deux mille pages jumelles
dilueraient le reste plus qu'elles ne l'aideraient. Rome en compte 153,
Séoul 42, Alexandrie 37.

### Ce que valent les données, dit sans fard

`npm run audit:lieux` passe le corpus au crible géographique. Il ne corrige
rien — la moitié de ce qu'il signale demande une meilleure source, l'autre une
décision qui n'appartient pas à un programme — mais il compte, et il nomme :

```
CE QUI DEMANDE UNE MEILLEURE SOURCE
    28   0,6 %  sans lieu de naissance du tout
   171   3,7 %  un pays entier tient lieu de ville
   270   5,9 %  une région ou une province tient lieu de ville

CE QUI DEMANDE UNE FORME FRANÇAISE
   263   5,7 %  nom resté dans une autre langue
  1864  40,6 %  sans notice en français
    98   2,1 %  sans biographie en français

CE QUI N’EST PAS UNE FAUTE
  1257  27,4 %  le nom désigne un autre lieu que la naissance
```

Cette dernière ligne mérite qu'on s'y arrête, parce qu'elle a l'air d'une
erreur et n'en est pas une. Un saint porte presque toujours le nom du lieu où
on le vénère, non celui où il est né : Nazaire **de Milan** est né à Rome,
Pancrace **de Taormine** à Antioche, Ovídio **de Braga** en Sicile. La carte,
elle, porte le lieu de naissance. Les deux sont exacts ; c'est la fiche qui
devait le dire, et elle le dit maintenant.

### Les doublons, et ce qui leur ressemble

Le corpus vient de deux endroits : deux cent quatre-vingt-cinq fiches écrites à
la main, quatre mille trois cent quarante-trois importées de Wikidata. Rien
n'empêchait l'une de redire ce que l'autre disait déjà, et rien ne pouvait le
voir : **« Padre Pio » et « Pio de Pietrelcina » sont le même capucin**, l'un
sous son nom d'usage, l'autre sous son nom de canonisation. Sur la carte, deux
croix se posaient au même endroit ; dans la lettre du 23 septembre, le même
homme revenait deux fois.

`npm run audit:doublons` rapproche et note — nom, années, jour de fête, lieu,
et le fait que les deux fiches viennent de corpus différents. Il ne fusionne
rien : savoir que Jacques de Zébédée est Jacques le Majeur, ou qu'Élisabeth
d'Aragon régna sur le Portugal, n'est pas affaire de seuil. Ce qu'un humain a
tranché vit dans `data/reference/doublons.json`, que la génération applique :

| | |
| --- | --- |
| `doublons` | **39 fusions.** L'identifiant gardé reçoit ce que l'autre savait de plus — une biographie, des sources, un titre, une langue de son nom — et ne perd rien de ce qu'il avait. |
| `ressemblances` | **9 groupes gardés distincts**, et pourquoi. Les seize carmélites de Compiègne, les filles de Nicolas II, les martyrs de Chine du 9 juillet 1900 : même jour, même lieu, même année de mort, des personnes différentes. |

C'est le gros du bruit, et c'est pourquoi la date de **naissance** pèse ici
plus lourd que celle de la mort. Quatre mille six cent vingt-huit fiches sont
devenues quatre mille cinq cent quatre-vingt-neuf ; au seuil suivant, il ne
reste que des compagnons de martyre.

### Qui est saint, et qui ne l'est pas

L'Église distingue quatre degrés — **serviteur de Dieu** dès l'ouverture de la
cause, **vénérable** quand les vertus héroïques sont reconnues,
**bienheureux** après la béatification, **saint** après la canonisation — et
les pages les disaient tous « saint ». Le 23 septembre, Darwin Ramos arrivait
ainsi en troisième position sous le nom de « saint Darwin Ramos » : mort à
dix-sept ans à Manille, il est serviteur de Dieu, sa cause est ouverte depuis
2019, et aucune source ne dit autre chose.

La source sûre est la propriété **P411** de Wikidata. L'importateur
l'interrogeait déjà — c'est même sa condition d'entrée, puisqu'il ne retient
que les fiches qui en portent une — mais il s'en servait pour filtrer et la
jetait ensuite. `tools/import-statuts.mjs` va la rechercher, et l'atelier
**« Relever les statuts de canonisation »** le lance depuis l'onglet Actions.
Ce n'est pas un réimport : refaire les quatre mille trois cents fiches pour
ajouter un mot rouvrirait les noms, les dates et les lieux, et une correction
ne doit pas coûter une révision générale. Dix-sept secondes de requêtes, un
seul fichier touché.

| | |
| ---: | --- |
| 2 979 | saints |
| 1 236 | bienheureux |
| 301 | vénérables |
| 44 | serviteurs de Dieu |
| 29 | sans degré connu |

**Ces chiffres sont la mesure de l'erreur** : mille deux cent trente-six
bienheureux et trois cents vénérables étaient appelés « saint ».

L'Orient ne dit pas « saint » mais la *classe* du saint : hiéromartyr pour un
évêque martyrisé, thaumaturge pour un faiseur de miracles, mégalomartyr,
stylite, égal-aux-apôtres, porte-passion, juste, croyant droit. Deux cent
trente fiches ne portaient que cela et restaient sans degré — c'est ce qui
privait saint Nicolas de Myre, sainte Catherine d'Alexandrie et saint Laurent
de Rome de leur titre. Ces classes sont reconnues ; `prelate`, qui est un rang
dans la hiérarchie et non un degré, ne l'est pas : un prélat peut n'être que
vénérable.

**Les vingt-neuf qui restent sont presque tous des patriarches d'Orient** —
Constantinople, Antioche, Alexandrie, Kiev — dont Wikidata ne dit que
« prelate ». On ne leur invente pas de degré : les nommer saints demanderait
une source que nous n'avons pas, et c'est précisément l'erreur qu'on vient de
corriger.

Quand la source se tait, la génération lit ce que la fiche dit d'elle-même. La
notice de Wikidata nomme souvent le degré — « saint catholique », « Filipino
Servant of God » —, et la biographie le raconte — « déclaré saint par l'Église
catholique », « béatifié en 1888 ». On n'y cherche que la formule, jamais le
mot nu : un récit qui mentionne « les saints de son temps » ne canonise
personne, et « ordre de Saint-Benoît » ne fait pas un saint de tous les
bénédictins. Une fiche peut enfin porter son degré en propre, et **la main
l'emporte sur tout le reste** : c'est par là qu'on rend son titre à un saint
des premiers siècles, qu'aucune congrégation n'a canonisé pour la raison qu'il
n'en existait pas encore.

**Ce qui reste sans degré ne porte aucun titre.** C'est le point de toute
l'affaire : le nom nu est la seule chose vraie qu'on puisse écrire d'une fiche
dont on ignore le degré, et il vaut mieux sous-dire que canoniser quelqu'un par
défaut.

Le degré paraît dans la fiche de la carte (ligne « Reconnaissance »), en tête
de chaque page de saint, dans la liste du jour et dans la lettre quotidienne :

```
- Saint Adomnán
- Bienheureuse Bernardyna Maria Jabłońska
- Serviteur de Dieu Darwin Ramos
- Vénérable Elena Duglioli
- Saint Pio de Pietrelcina
```

### Les sept cent soixante-douze sans récit

L'import de masse ne demandait à Wikidata que deux articles : le français et
l'anglais. C'est ce qui s'affiche, et cela couvrait quatre fiches sur cinq. Le
cinquième cinquième n'a d'article dans aucune des deux — et ce n'est pas un
hasard :

```
ESP 248   ITA 130   CHN 72   POL 52   FRA 47   KOR 30   RUS 28   TUR 22
```

Deux cent quarante-huit martyrs de la guerre d'Espagne, cent trente Italiens,
soixante-douze Chinois de 1900, cinquante-deux Polonais, trente Coréens. **Leur
vie est écrite**, mais en espagnol, en italien, en polonais, en coréen. C'est
la question qui était trop étroite, non la source qui est muette.

`tools/completer-bios.mjs` la repose en vingt-trois langues, d'une seule
requête par lot — on demande tous les articles d'un élément et l'on lit le
domaine de chacun, plutôt qu'une requête par langue —, et dépose ce qu'il
trouve dans `data/saints/bios-importees.json` avec l'adresse de chaque article.
L'atelier **« Compléter les biographies »** le lance depuis l'onglet Actions ;
il lui faut Internet, que Wikidata n'accorde pas depuis tous les réseaux.

**Six cent soixante-dix-neuf** des sept cent soixante-douze ont ainsi retrouvé
un récit :

```
pl 369   it 247   ru 235   es 141   ca 76   cs 61   de 46   pt 33
ko 25    uk 24    el 19    la 19    nl 17   ro 10   sl 6    hr 5
```

Aucune en français, et c'était couru : ce sont exactement les fiches pour
lesquelles Wikipédia n'a pas d'article français. **L'outil ne traduit pas, et
c'est délibéré** : la carte n'affiche que le français, et ce qu'il rapporte est
la matière d'une traduction faite à la main — les six cent soixante-dix-neuf
l'ont été depuis, une à une, et se lisent maintenant sur la carte. Voyez
[les biographies traduites](#les-biographies-traduites-en-vingt-deux-langues).

### Les biographies traduites, en vingt-deux langues

Mille deux cent dix-sept fiches n'avaient de récit qu'en une autre langue que le
français. La carte n'affichant que le français, elles paraissaient sans
biographie — l'information existait, mais personne ne la voyait. **Toutes sont
maintenant traduites**, et la part des fiches pourvues d'une biographie
française passe de 71 % à **97,9 %** : il n'en reste que quatre-vingt-dix-huit
sans récit, sur quatre mille cinq cent quatre-vingt-neuf.

```
en 537   pl 234   it 183   es 119   ru 37   ko 21   de 17   ca 15
pt 12    el 10    cs 7     ro 7     sl 4    nl 4    vi 3    uk 2
hr 2     la 1     zh 1
```

Les cinq cent trente-sept premières venaient de l'anglais. Les six cent
soixante-dix-neuf autres sont celles que `completer-bios.mjs` est allé chercher
là où Wikipédia les avait écrites — chez les martyrs d'Espagne, d'Italie, de
Chine, de Pologne et de Corée, dont personne n'avait écrit la vie en français ni
en anglais.

Les traductions vivent dans `data/saints/traductions.json`, à part du corpus et
pour une raison précise : un réimport réécrit `wikidata.json` d'un bloc, et
emporterait tout ce qu'on y aurait écrit. Le fichier, lui, se garde. La
traduction ne comble qu'un manque — elle n'écrase jamais un français trouvé à la
source — et le jour où l'article français paraît sur Wikipédia, l'import le
rapporte et la traduction s'efface d'elle-même.

**Chaque fiche traduite dit de quelle langue.** La licence de Wikipédia
(CC BY-SA) demande qu'une modification soit signalée, et une traduction en est
une : la fiche porte « traduit du polonais », « traduit de l'italien »,
« traduit du coréen », d'après l'article cité en source, qui reste joint. Le
champ `de` de chaque traduction nomme cette langue, et l'élision suit —
« de l'anglais » mais « du polonais », ce qui se voit quand on s'en dispense.
Les douze langues de l'interface ont chacune leur tournure, et le nom de la
langue vient du navigateur, qui les connaît toutes.

**Cinq fiches anglaises n'ont pas été traduites, et le fichier dit pourquoi.**
Dans chaque cas, le texte ne parlait pas du saint de la fiche : Agustín Caloca
Cortés portait mot pour mot la biographie de Cristóbal Magallanes — l'article
anglais redirige de l'un vers l'autre —, Albina de Césarée avait reçu l'article
du prénom *Albina* et de la déesse étrusque de l'aurore, Archippos celui du
poète comique athénien, Gwen ferch Cynyr celui d'une paroisse rurale de
Cornouailles, et l'extrait de Théophane Graptos était tronqué au milieu d'une
phrase. Traduire aurait donné un récit faux, mais en français, donc plus
crédible. Ce sont des défauts de l'import, à corriger à la source.

`build:data` corrige au passage ce qu'il peut : quand le libellé français de
Wikidata n'est pas français — « Natale di Milano », « Hroznata von Ovenec » —
et qu'un article français existe, son titre en tient lieu. Trente-neuf fiches y
ont gagné leur nom français sans qu'il faille réinterroger quoi que ce soit.

`npm run check` relit ensuite le tout : autant de fiches que de saints publiés,
chaque adresse du plan du site pourvue d'un fichier, et les liens internes d'un
échantillon de pages vérifiés un à un — un lien mort ne se voit pas à l'usage,
mais un robot les suit tous.

## L'icône, en trois cadrages

Le logo est une carte de visite : un planisphère, une silhouette auréolée, puis
« SAINTS » et « CARTE MONDIALE DE L'ÉGLISE CATHOLIQUE ». C'est très bien à deux
cents pixels et illisible à seize — à cette taille, le mot ferait deux pixels
de haut et le planisphère deviendrait du bruit turquoise. Réduire le logo
entier donnerait donc une tache.

`npm run build:icons` en tire trois cadrages, et chaque taille prend celui
qu'elle peut porter :

| Tailles | Cadrage | Ce qu'on y voit |
| ---: | --- | --- |
| 512, 192, 180 | la carte entière | l'icône d'application, texte compris |
| 64, 48 | l'emblème | planisphère et silhouette, sans le texte |
| 32, 16 | la silhouette | la seule forme qui survive à seize pixels |

S'y ajoute une icône **masquable** à part : Android rogne celle-là à sa guise —
cercle, goutte, carré arrondi — et ne garantit que les quatre cinquièmes du
centre. La carte entière y perdrait son bord doré ; l'emblème seul, posé au
milieu d'un grand carré crème, ne craint aucune découpe.

Le tout est déclaré dans `index.html`, dans chacune des 6 256 pages générées et
dans `site.webmanifest`, qui fait de la carte une application installable — nom,
couleur de fond, et trois raccourcis vers le calendrier, les saints et les pays.

**Aucune bibliothèque n'a été installée pour cela.** Le projet ne dépend de rien
pour fonctionner, et six icônes ne valaient pas vingt mégaoctets de binaire
natif : `tools/lib/png.mjs` lit et écrit le PNG avec le seul `zlib` de Node —
en-tête, filtres de ligne, flux compressé —, et un fichier ICO n'est qu'un
sommaire suivi de PNG. La réduction se fait par moyenne de surface : à seize
pixels, un simple échantillonnage ne prendrait qu'un pixel sur soixante-dix et
ferait disparaître la crosse et l'auréole.

Le logo d'origine reste dans `data/brand/logo.png` : les icônes se refont d'une
commande s'il change.

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

Au monde, un cartouche annonce l'étendue du corpus — « 4 628 saints recensés
dans 91 pays » — avant même le premier clic. Il s'efface dès qu'on descend
d'une échelle, où le compte devient celui du pays ouvert.

Le déplacement est borné à chaque échelle : on ne peut pas dériver
indéfiniment hors de la carte. La touche `Échap` remonte d'un niveau — et, au
monde comme au continent, un clic sur la mer aussi, tant qu'aucun fond de rues
n'est posé. En vue pays il ne le fait plus : l'écran y est couvert de croix
serrées, et un doigt qui en manquait une remontait au continent, emportant le
pays et ses quatre cents saints. Le fil d'Ariane permet d'aller directement où
l'on veut.

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

**Et la liste défile.** Trois noms tiennent dans une bulle ; cent quatre-vingts
non. Au cadrage de l'Italie, Rome réunit à elle seule 181 fiches, et la liste
sortait de l'écran par le bas : les derniers noms existaient sans qu'on puisse
les atteindre. Elle se borne désormais à la place réellement libre — on mesure
ce qu'il y a au-dessus du repère et ce qu'il y a en dessous, on retient le plus
large des deux, sans jamais dépasser les sept dixièmes de la hauteur —, et ce
qui ne tient pas se fait glisser au doigt.

Trois détails sans lesquels ce défilement n'en serait pas un :

- la carte porte `touch-action: none`, pour que le doigt la déplace au lieu de
  faire défiler la page ; la liste en héritait, et le doigt glissait alors sur
  des noms immobiles. Elle reprend donc `pan-y` pour son compte, et
  `overscroll-behavior: contain` empêche le geste, arrivé au bout, d'emporter la
  page derrière ;
- le titre — « 181 saints ici » — reste collé en haut : c'est lui qui dit
  combien la liste porte, et donc qu'il en reste sous le pouce ;
- un liseré en bas signale qu'il y a une suite, et s'efface au dernier nom :
  une liste qui déborde sans le dire passe pour une liste complète, et l'on ne
  cherche pas ce qu'on ne sait pas absent.

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

### Poser la carte sur l'écran d'accueil

Dans **Paramètres → Ajouter à l'écran d'accueil**. Le bouton n'est pas un
bouton comme les autres : selon le navigateur, il n'existe pas.

| | |
| --- | --- |
| **Chrome, Edge, Android** | Le navigateur émet `beforeinstallprompt` quand il juge le site installable. On le retient — au lieu de laisser le navigateur poser sa bannière quand cela lui chante — et l'on offre un vrai bouton, qui installe. |
| **iPhone, iPad** | Safari n'a pas cette API du tout. Aucun bouton ne peut y installer quoi que ce soit : la partie affiche la marche à suivre — Partager, puis « Sur l'écran d'accueil ». |
| **Safari sur Mac** | Menu Fichier, « Ajouter au Dock ». |
| **Firefox** | Son propre menu sur Android ; rien sur ordinateur. |
| **Déjà installée** | On le dit, et l'on n'offre rien. |

Un bouton mort vaudrait moins qu'une phrase qui explique : c'est pourquoi il y
a quatre écrans pour un seul réglage.

**Un service worker était nécessaire**, et il rend deux services. Chrome ne
propose l'installation que si le site sait répondre hors ligne : sans `sw.js`,
aucun `beforeinstallprompt` ne serait émis et le bouton ne paraîtrait jamais.
Mais une carte des saints se consulte aussi dans une église ou un train, là où
le réseau manque.

Il va **au réseau d'abord**, et ne se sert du cache qu'en secours. Un service
worker mal réglé est pire que pas de service worker : il fige une ancienne
version chez le lecteur, parfois pour des mois, et le corpus change à chaque
import. Ici le lecteur connecté voit toujours la dernière version, le lecteur
coupé du réseau voit la dernière qu'il a vue, et personne ne voit du figé. Il
ne précharge que la coquille — le site pèse cinquante mégaoctets, les
télécharger derrière le dos du lecteur serait un abus.

### Être prévenu chaque jour

Dans **Paramètres → Rappel quotidien**, quatre chemins — et ils ne valent pas
la même chose. Le dire est la moitié du réglage :

| | Ce que ça fait | Ce que ça vaut |
| --- | --- | --- |
| **Calendrier du téléphone** | Produit un fichier `.ics` : un événement par jour pourvu — 365 aujourd'hui —, répétés tous les ans, chacun avec une alarme à l'heure choisie. | **C'est le chemin qui atteint vraiment le téléphone.** Une fois le fichier ouvert sur l'appareil, c'est l'agenda qui prévient — hors ligne, sans compte, sans que l'application soit ouverte. |
| **Réveil en arrière-plan** | Le navigateur réveille lui-même le service worker environ une fois par jour ; celui-ci lit le calendrier abrégé et écrit la notification. | Sans serveur et sans que rien sorte de l'appareil — mais **Chrome et ses dérivés seulement**, **l'application posée sur l'écran d'accueil**, et **c'est le navigateur qui choisit l'heure**. |
| **Notification du navigateur** | Demande la permission, puis annonce le saint du jour à l'heure dite. | Seulement **tant que cette page est ouverte**. |
| **La lettre quotidienne** | Un flux Atom réécrit chaque matin, avec les saints du jour et leur biographie entière. | Marche partout, sans permission ni installation — mais c'est au lecteur d'aller le chercher, ou de le faire suivre par courriel. Voir [la lettre](#la-lettre-quotidienne). |

Ce qu'aucun de ces chemins ne fait : réveiller un appareil éteint. Seul **Web
Push** y parvient, et il suppose un serveur qui garde la liste des abonnés et
pousse un message chaque matin. Ce site est fait de fichiers posés sur un
hébergement statique ; lui adjoindre une machine pour cela seul, avec ses clés
et sa base d'adresses, n'est pas un détail d'implémentation. Le calendrier du
téléphone, lui, y arrive sans personne — parce que c'est l'appareil qui garde
les événements et déclenche l'alarme.

L'heure est écrite en temps *flottant* — ni `Z`, ni fuseau : la notification
tombe à sept heures là où l'on se trouve, et non à sept heures de Paris quand
on est à Montréal.

Le réveil en arrière-plan repose sur la **synchronisation périodique**
(`periodicSync`), inscrite sous l'étiquette `saint-du-jour` pour une journée
d'intervalle. Le service worker ne télécharge alors pas le corpus — cinq
mégaoctets — mais `data/generated/calendar.json`, un calendrier abrégé de
375 ko qui ne porte qu'un nom, une ville, un pays et une adresse par saint.
L'étiquette de la notification porte le jour (`saint-du-jour-09-17`) : deux
réveils le même jour ne font qu'une annonce. Le clic ouvre la page du jour, en
réutilisant l'onglet déjà ouvert plutôt que d'en empiler un.

Les cinq états possibles sont dits en clair dans les réglages, plutôt que de
laisser une case cochée qui ne ferait rien : *inconnu* (le navigateur ne sait
pas), *à installer* (l'application n'est pas sur l'écran d'accueil), *refusé*
(les notifications sont bloquées), *possible* et *actif*. Quand il est actif,
un bouton **Voir ce que ça donne** montre tout de suite l'annonce du jour —
sans quoi il faudrait attendre un jour pour savoir si le réglage a pris.

### La lettre quotidienne

Chaque matin, `.github/workflows/daily-feed.yml` réécrit `feed.xml` et le verse
au dépôt, ce qui le republie. Une entrée par jour, la plus récente en tête, et
dans chacune **tous les saints fêtés ce jour-là avec leur biographie entière** —
la lettre elle-même, lisible dans le lecteur, non une amorce qui renverrait au
site. Quatorze jours sont gardés : qui s'abonne aujourd'hui, ou revient après
une semaine, retrouve ce qu'il a manqué.

```
node tools/build-feed.mjs                 # la quinzaine écoulée
node tools/build-feed.mjs --jours 3
node tools/build-feed.mjs --date 2026-12-25
```

La page [`lettre/`](lettre/) explique comment s'y abonner — par un
lecteur de flux, ou par courriel via un relais au choix du lecteur.

Le flux ne demande rien : le fichier est posé à côté des autres, chacun s'y
abonne où il veut, et le site n'apprend ni qui lit ni combien.

### La même lettre, par courriel

`tools/send-letter.mjs` compose la lettre du jour et la remet à un routeur de
courriel ; `.github/workflows/daily-letter-mail.yml` l'appelle chaque matin, à
5 h 40 UTC — une vingtaine de minutes après l'écriture du flux, de sorte que ce
qui part par courriel dit exactement ce que le flux publie.

**Le texte est écrit une seule fois**, dans `tools/lib/lettre.mjs`, et les deux
le lisent. Deux rédactions séparées auraient divergé au premier changement —
l'une dirait « et 12 autres », l'autre « et 12 de plus » —, et le lecteur abonné
aux deux s'en apercevrait. Le courriel part en HTML **et** en texte brut : un
message qui n'apporte que du HTML finit plus volontiers dans les indésirables.

Trois routeurs sont prévus, tous par HTTP et sans aucune dépendance — le seul
`fetch` de Node suffit, comme pour les fournisseurs de modèle :

| | |
| --- | --- |
| **Brevo** | maison française, 300 courriels par jour gratuitement |
| **Resend** | la plus simple à mettre en route, 3 000 par mois |
| **Mailjet** | maison française également, 6 000 par mois |

Rien ne part tant que les secrets ne sont pas posés : l'atelier le dit et
s'arrête, sans échouer.

```
npm run send:letter -- --essai              # composer et montrer, sans envoyer
npm run send:letter -- --essai --date 2026-12-25
npm run send:letter                         # envoyer pour de bon
```

Les réglages vivent dans les secrets du dépôt — jamais dans le code :
`MAIL_API_KEY`, `MAIL_FROM`, `MAIL_TO`, et `MAIL_API_SECRET` pour Mailjet seul.
Le routeur se devine de la clé lorsqu'on ne le nomme pas.

**Chaque destinataire reçoit son propre message.** Mettre dix adresses dans un
même champ « à » les montre toutes à chacun ; une lettre n'a pas à révéler qui
la reçoit. Une erreur sur l'un n'arrête pas les autres, et le compte rendu dit
ce qui est parti et ce qui a échoué.

**L'adresse d'expédition doit appartenir à un domaine vérifié** par le routeur,
avec les enregistrements SPF et DKIM qu'il indique. Sans cela le courriel part
quand même — et arrive dans les indésirables, ou nulle part. Ce n'est pas une
formalité : c'est la moitié du travail.

### Ce que cette lettre ne fait pas

Elle ne tient **pas de liste d'abonnés**. Les adresses sont écrites à la main
dans un secret du dépôt. Cela convient pour soi et pour quelques personnes qui
l'ont demandé ; cela ne convient pas à une lettre publique, et il vaut mieux
dire pourquoi que de le laisser découvrir :

- **Recueillir des adresses** demande un formulaire, donc un endroit qui reçoit
  — ce qu'un site de fichiers statiques n'a pas.
- **Le désabonnement** doit être immédiat et sans condition. Un lien qui marche
  suppose quelque chose qui l'écoute.
- **Le consentement** se prouve : qui s'est abonné, quand, et comment. Le RGPD
  ne s'accommode pas d'un fichier tenu de mémoire.

Ces trois choses sont le métier des services de lettres d'information. Le jour
où la lettre s'ouvre au public, c'est à l'un d'eux qu'il faut confier la liste
— pas à un secret de dépôt. En attendant, chaque envoi porte de quoi se
désabonner : une réponse suffit, et elle arrive à quelqu'un.

## L'écran en deux moitiés

De haut en bas : la carte tient la moitié du haut, la fiche du saint ouvert
celle du bas. Ce n'est pas un panneau posé par-dessus — la carte rétrécit pour
de bon, son `ResizeObserver` s'en aperçoit et elle se recadre dans ce qui lui
reste. On lit donc la biographie sans perdre de vue le pays et ses croix.

La fiche était dans le tiroir latéral, qui recouvre la carte sur un téléphone :
l'ouvrir cachait le pays et ses quarante-huit repères derrière un panneau de
neuf dixièmes d'écran. Rien n'avait été retiré, mais on ne voyait plus rien —
ce qui revient au même pour qui regarde.

**La carte garde ce qu'elle montrait.** Si elle était au cadrage du pays — le
pays tout entier —, elle le reste dans la moitié qui lui reste, sans quoi le
sud déborderait sous la fiche. Si le lecteur avait zoomé, son échelle est un
choix : on n'y touche pas, on se contente d'amener la croix ouverte dans la
partie visible, par un déplacement et jamais par un zoom. Quand la fiche
s'ouvre au terme d'un vol depuis le monde, elle s'ouvre **avant** le vol : le
cadrage doit être calculé sur la moitié, non sur la hauteur d'avant.

### Ce que la fiche disait d'inutile

Le relevé de la fiche finissait sur « État : Publiée ». C'était l'état de
modération — ce qui ne regarde que l'administrateur, et ce qui vaut « Publiée »
pour les quatre mille cinq cent quatre-vingt-neuf fiches de la carte : une ligne
sur sept ne disait rien. Une fiche qui n'est *pas* publiée se signale déjà en
tête, par un bandeau qu'on ne peut pas manquer.

Cette ligne porte maintenant les **qualités** — moine, évêque, martyre, docteur
de l'Église —, qui étaient en pastilles trois centimètres plus haut et de
nouveau plus bas sur la page du saint. Les pastilles sont parties : deux fois la
même chose dans un panneau d'une demi-hauteur d'écran, c'était une ligne de
biographie en moins.

### L'écran d'attente, et ce qu'il dit

La carte met une à deux secondes à se peupler. Ces deux secondes-là servaient à
faire clignoter une croix ; elles disent maintenant ce qu'est SanctiMaps, ce
qu'il contient, qu'il grandit encore, et à quelle adresse écrire —
`sanctimaps@gmail.com`. Le texte est **écrit dans `index.html`**, non posé par
le code : un moteur de recherche le lit sans exécuter une ligne de JavaScript.

**L'écran attend qu'on le ferme.** Il partait tout seul dès que la carte était
prête, c'est-à-dire au bout d'une seconde ou deux : personne n'avait le temps de
lire. La carte se peuple donc derrière pendant qu'on lit, le message passe de
« Chargement de la carte… » à « La carte est prête », et l'on sort par la croix
du coin haut-droit, par le bouton du bas, ou par Échap.

Trois détails que l'usage impose :

- la croix est en `position: fixed`, non `absolute`. Le texte tient sur un écran
  et demi de téléphone : une croix posée en absolu remonte avec lui, et n'est
  plus là quand on la cherche au coin ;
- le même bouton est répété au bas du texte. Qui vient de lire trois cents mots
  n'a pas à remonter chercher le coin ;
- Échap coupe la propagation. La carte écoute la même touche pour refermer une
  fiche ou remonter d'un niveau : sans cette coupure, elle reculerait d'un cran
  avant même qu'on l'ait vue.

Le nœud est retiré, non masqué — un calque invisible posé sur la carte
intercepterait les gestes —, après un fondu de deux dixièmes plutôt qu'une
coupure. Tant qu'il est ouvert, ce qu'il couvre porte `inert` : le calque arrête
la souris, `inert` arrête la tabulation et le lecteur d'écran, sans quoi
`aria-modal` ne serait qu'une promesse.

**La carte reste la base** : rien d'autre n'est demandé que de fermer, et les
deux sorties sont visibles sans chercher.

Un écran qui disparaît ne vaut pourtant rien pour le moteur qui, lui, exécute le
code — et c'est le cas du principal. Le même texte vit donc sur **`a-propos/`**,
page générée qui ne disparaît pas, liée depuis l'en-tête des 6 256 pages et
depuis le bandeau de l'accueil. Ses chiffres sont comptés à la génération, jamais
écrits à la main : une page d'à-propos qui se vante à faux se remarque.

Ceux de l'accueil, eux, sont écrits à la main — il le faut, puisque c'est leur
présence sans JavaScript qui leur donne leur valeur. Une fusion de doublons en
avait fait mentir deux sans que rien ne le dise : la page promettait 4 628 fiches
pour 4 589, et 523 lieux pour 509. `npm run check` les relit maintenant contre le
corpus, l'adresse de contact comprise, et échoue bruyamment plutôt que de laisser
la page se vanter à faux.

### Ce qui a été retiré du haut de la carte

Trois choses encombraient le bandeau et n'y sont plus : la consigne
« Choisissez un continent », le cartouche « 4 628 saints recensés dans 91
pays », et la rangée de pastilles Europe / Afrique / Asie… Sur un téléphone,
elles occupaient trois bandes de la hauteur utile et recouvraient l'Atlantique
nord ; elles disaient ou faisaient ce que la carte dit ou fait déjà — on
choisit un continent en le touchant, et les chiffres du corpus sont écrits en
toutes lettres dans le bandeau de titre, au-dessus.

Reste le compte du pays ouvert — « 1 094 saints recensés » —, qui n'est écrit
nulle part ailleurs et qu'on ne peut pas deviner en regardant.

Au même endroit, le bouton du tiroir se posait **sur le titre de la page**,
qu'il masquait à moitié. Il était pourtant placé « en haut à gauche » : mais
son conteneur n'était pas positionné, de sorte que l'absolu se calait sur la
page entière au lieu de la partie carte. Une déclaration manquait, une seule.

### Viser le Luxembourg avec un doigt

Sur l'Europe entière, le Luxembourg fait **quatre pixels sur huit** ; Malte,
Andorre et Monaco en font trois. Aucun doigt ne vise cela, et un doigt qui manque
tombait sur le voisin. Deux remèdes, qui se complètent.

**Le continent se grossit.** Le zoom libre n'existait qu'en vue pays ; il existe
maintenant aussi au continent, à la molette, au pincement, au clavier et par les
deux boutons — qui paraissent désormais dès ce niveau. Jusqu'à **huit fois** le
cadrage d'arrivée, ce qui porte le Luxembourg à trente-deux pixels sur soixante
et Andorre à dix-huit sur seize. Au-delà, on ne choisit plus un pays, on visite
le sien : c'est la vue pays qui sert à cela. Le bouton « ⤢ » revient au continent
entier, et le déplacement reste borné par ses limites.

**Le nom devient une cible.** « Luxembourg » écrit sur la carte fait quatre-vingt-
huit pixels sur quarante-neuf, quand le Luxembourg en fait quatre sur huit : un
rectangle invisible posé derrière le nom reçoit le doigt et ouvre le pays. C'est
d'ailleurs ce qu'on visait — on vise le mot, pas le contour.

Deux règles étaient nécessaires pour que ce second remède ne fasse pas plus de mal
que de bien, et l'essai au navigateur a trouvé les deux :

- **le tracé l'emporte sur le mot.** « Allemagne », écrit en travers, couvre la
  Belgique tout entière à l'échelle de l'Europe : un doigt posé sur la Belgique
  ouvrait l'Allemagne. Qui touche une terre a visé cette terre ; le nom ne sert
  que là où il n'y a rien d'autre à viser — la mer, ou un pays trop petit ;
- **une étiquette masquée ne reçoit plus rien.** `pointer-events` s'hérite, mais
  une valeur explicite sur l'enfant l'emporte : le rectangle disait « all » et
  continuait d'intercepter le doigt sous un nom invisible. À l'échelle de
  l'Europe, où les noms du Benelux se recouvrent tous, viser la Belgique ouvrait
  les Pays-Bas.

Un troisième défaut est tombé au passage, et il était ancien : **tout pincement
se terminait par une tape**. Le second doigt ne marquait pas le geste comme un
déplacement, de sorte qu'au relâchement la carte ouvrait ce que le premier doigt
touchait — on zoomait sur l'Europe et l'on se retrouvait en Suède.

Une limite assumée : le fond de carte est en basse définition — cent dix
millions —, et à huit fois le Danemark devient un polygone à six sommets. C'est
le prix d'un planisphère de cent soixante-dix kilooctets, et l'on grossit ici
pour atteindre un pays, non pour en admirer les côtes ; le contour fin arrive
quand le pays s'ouvre.

### Le geste qui faisait tout disparaître

« Quand on appuie sur un saint, les autres saints du pays disparaissent. » Ils
ne disparaissaient pas : on quittait le pays.

En vue pays, un clic qui ne touchait ni un repère ni un tracé était pris pour
un « clic à côté », et remontait au continent — le pays s'effaçait alors avec
ses quatre cents croix. Or l'écusson d'un repère fait quinze pixels de côté :
un doigt qui le manque de vingt pixels tombe sur la mer. Le geste que l'on
croyait faire — ouvrir un saint — produisait l'inverse.

Deux remèdes, tous deux vérifiés au navigateur :

| | |
| --- | --- |
| **Une cible à la taille du doigt** | Un disque invisible de vingt-et-un pixels de rayon, devant le médaillon, reçoit le clic. À vingt pixels du centre, on ouvrait la carte ; on ouvre maintenant le saint. |
| **Le fond ne fait plus reculer** | En vue pays, un clic « à côté » ne remonte plus d'un niveau. On revient par le fil d'Ariane, toujours à l'écran, ou par Échap — qui ferme d'abord la fiche, et ne remonte qu'ensuite. |

La règle du fond valait déjà sous un fond de tuiles, et pour la même raison :
quand tout l'écran est de la carte, il n'y a plus de « à côté ».

## Les lieux qu'un saint a marqués

La carte pose une croix au lieu de naissance, et une vie ne tient pas dans un
point : Ambroise est né à Trèves et repose à Milan, Thomas Becket est né à
Londres et c'est Canterbury qui garde son sang, Paul de Tarse a marqué vingt-sept
lieux du pourtour méditerranéen.

**Ouvrir une fiche efface les autres croix.** Un pays en porte jusqu'à mille
cent, et lire une vie au milieu de mille croix, c'est chercher des yeux celle
qu'on lit à chaque phrase. Elles reviennent à la fermeture.

**Au-dessus du récit, à droite, un bouton** — « Voir les 3 lieux qu'il a
marqués ». Il ne paraît que s'il y en a : un bouton qui ouvrirait une liste vide
ne propose rien, il déçoit. Pressé, il pose des perles vertes sur la carte, cadre
le saint et ses lieux ensemble, et déplie sous lui ce que chacune est — car un
point ne dit pas qu'il est une sépulture.

### Ce qu'est un lieu marqué

Onze motifs, et onze seulement :

| propriété | ce qu'elle dit | le mot de la fiche | combien |
| --- | --- | --- | --- |
| P119 | lieu de sépulture | Sépulture | 968 |
| P20 | lieu de mort | Lieu de mort | 3 870 |
| P112 ⁻¹ | ce qu'il a fondé | Fondation | 257 |
| P937 | lieu de travail | Œuvre | 227 |
| P69 | lieu d'études | Études | 483 |
| P551 + P580 | résidence commencée avant dix-huit ans | Enfance | 27 |
| P551 | lieu de résidence | Résidence | 262 |
| P19 | lieu de naissance | Naissance | 245 |
| à la main | ce qu'il a vu | Apparition | 13 |
| à la main | ce qui s'y est fait | Miracle | 4 |
| à la main | le lieu où il revenait | Lieu de prédilection | 8 |

**L'enfance se déduit, et seulement quand on peut.** Wikidata n'a pas de
propriété « a grandi ici ». Elle a des résidences, parfois datées, et des lieux
d'études, parfois datés eux aussi. Quand cette date tombe dans les dix-huit
premières années d'une vie dont on connaît le début, le lieu est dit *Enfance* ;
sinon il reste *Résidence* ou *Études*. Un saint dont on ignore l'année de
naissance n'aura jamais de lieu d'enfance ici, et c'est plus honnête qu'un « sans
doute » posé sur une carte. Vingt-sept fiches seulement en ont un : la source est
avare, et l'on préfère le dire.

**Les miracles et les apparitions, Wikidata ne les porte pas.** Les deux prises
possibles — l'événement notable situé (P793 + P276), l'événement dont le saint
est participant (P710) — ramènent surtout des conciles et des canonisations ; on
ne garde que ce dont le nom dit le miracle ou l'apparition, et cela n'a rendu
qu'une seule ligne sur cent soixante-sept. Les autres sont donc **écrits à la
main**, dans `data/saints/lieux-notables.json`, chacun avec le texte qui
l'atteste : la *Legenda maior* pour les stigmates de François à La Verna, le
procès de 1431 pour les voix de Jeanne à Domrémy, l'*Autobiographie* de
Marguerite-Marie pour Paray-le-Monial, les *Dialogues* de Grégoire le Grand pour
la grotte de Subiaco.

**Six apparitions du corpus ont un voyant qui est lui-même une fiche** — Jacques
à Saragosse, Juan Diego au Tepeyac, Mariana de Jesús Torres à Quito, Catherine
Labouré rue du Bac, Bernadette à Lourdes, Francisco et Jacinta Marto à Fátima.
`data/saints/voyants.json` fait le pont, et le lieu est **pris de l'apparition**,
non recopié : si la carte corrige un jour les coordonnées de Fátima, la fiche des
Marto suivra sans qu'on y touche. Les voyants qui ne sont pas au corpus — Mélanie
Calvat à La Salette, Mariette Beco à Banneux, Lúcia dos Santos à Fátima — n'y
figurent pas : il n'y aurait pas de fiche à ouvrir au bout.

**Un endroit peut être deux choses.** La chapelle de la rue du Bac est celle où
Catherine a vu et celle où elle repose ; le Tepeyac est où Juan Diego a vu et où
il est mort. Choisir aurait perdu à tous les coups la moitié de ce qui fait
venir : une perle porte donc un motif de tête — le plus parlant — et la liste des
autres derrière lui, « Sépulture · Apparition ».

**Les dédicaces sont exclues, et c'est le cœur de la définition.** Il y a des
milliers d'églises Saint-Pierre, et Pierre n'en a marqué aucune : elles ont été
marquées *par d'autres, après lui*. Un lieu marqué par le saint est un lieu où il
a grandi, étudié, vécu, œuvré, fondé, où il a vu le ciel s'ouvrir, où il est
mort, ou repose.

La collecte a rendu **6 357 lieux pour 4 216 saints**, soit 1,5 par saint ; mille
deux cent trente-quatre en ont plus d'un. Trois mille quatre cent vingt-quatre
lieux de naissance ont été écartés : la croix y était déjà. Un lieu qui revient
par deux relations — on meurt là où l'on vivait, on repose là où l'on est mort —
ne donne qu'une perle, et c'est la plus parlante des deux qui la nomme. Les lieux
écrits à la main se fondent à trois cent cinquante mètres et non à un kilomètre :
la basilique Sainte-Claire avalait San Damiano, qui est à six cents mètres et
hors les murs — deux lieux que quarante ans de clôture séparent.

La table pèse 754 ko et **descend après la carte**, comme les textes : elle ne
sert qu'à qui ouvre une fiche et demande à voir. Son absence n'est pas une panne —
la fiche n'offre alors rien à voir, ce qui est vrai.

### Ce qui s'est passé là

Un motif dit la catégorie, non le fait. « Jeanne d'Arc — Rouen — Lieu de mort »
est exact et ne dit rien : ni le bûcher de la place du Vieux-Marché, ni les
dix-neuf ans, ni les cendres jetées à la Seine pour qu'il n'en reste rien.

Soixante-quatorze lieux portent donc **une phrase**, sous le nom, dans la fonte
du récit :

> **LIEU DE MORT** Rouen
> *Brûlée vive place du Vieux-Marché le 30 mai 1431, à dix-neuf ans, au terme
> d'un procès en hérésie mené par un tribunal d'Église aux ordres des Anglais.
> Ses cendres furent jetées à la Seine pour qu'il n'en reste rien.*

Ces phrases ne sont **nulle part dans les données** : ni Wikidata ni aucune base
ne porte « ce qui s'est passé ici ». Elles se tirent des sources une par une, et
vivent dans `data/saints/notes-lieux.json` — le crucifix de San Damiano d'après
la *Legenda trium sociorum*, la dilatation du cœur de Philippe Néri d'après
l'autopsie de 1595, le bunker de la faim où Kolbe prend la place d'un autre.
Quarante-cinq saints en ont, ceux qu'on ouvre le plus.

**Ailleurs, la fiche se tait**, et c'est voulu : une phrase construite d'un
gabarit — « le lieu de sa sépulture » sous l'étiquette *Sépulture* — ne dirait
rien que l'étiquette ne dise déjà, en six mille exemplaires. Le fichier
s'étend à la main, un lieu à la fois.

Chaque note vise un saint et un lieu **par son nom exact**. Un nom qui ne
correspond à rien arrête la fabrication, en disant quels noms cette fiche porte :
une note qu'on croit écrite et qui ne paraît pas est le pire des deux mondes, et
une collecte peut renommer un lieu du jour au lendemain.

### Refuser un lieu

La collecte prend ce que Wikidata dit, et Wikidata se trompe parfois. Elle
donnait à Jeanne d'Arc une sépulture à la cathédrale de Winchester — or Jeanne
d'Arc n'a pas de tombe, c'est même tout le propos du 30 mai 1431 ; Winchester
garde le tombeau du cardinal Beaufort, qui présida son procès.

`data/saints/lieux-ecartes.json` refuse ces lieux-là, chacun avec sa raison
écrite. Une règle qui ne s'applique plus arrête aussi la fabrication : la source
a peut-être été corrigée, et l'on garderait sinon un refus dont plus personne ne
sait pourquoi il est là. Une fausseté écrite sous le nom d'un saint coûte plus
cher qu'un lieu manquant.

### Trois choses que le cadrage imposait

- **le domaine de déplacement s'élargit aux lieux.** Boniface est né dans le
  Wessex et repose à Fulda : la carte ramenait de force en Angleterre le lecteur
  qu'on venait d'emmener en Hesse ;
- **le plancher du zoom suit ce même cadre**, sinon « − » refusait de montrer
  l'ensemble qu'on venait de cadrer ;
- **« montre-t-on le pays entier ? » répond non** tant que des lieux sont à
  l'écran. Sans quoi l'ouverture ou la fermeture de la fiche recadrait sur le
  pays, et la sépulture qu'on venait d'atteindre en sortait.

Un défaut d'ordre a été trouvé à l'essai : ouvrir une fiche montre le saint seul,
*puis* vole jusqu'à lui — et cet ordre est voulu, la fiche prenant la moitié du
bas avant que le cadrage se calcule. Le vol effaçait donc le saint qu'on venait
d'isoler, et les autres croix revenaient aussitôt.

## Les saints qu'il a pu croiser

Une carte de quatre mille cinq cents croix donne à croire à quatre mille cinq
cents solitudes. Or Benoît a une sœur, Scholastique ; Thomas d'Aquin a un
maître, Albert le Grand ; Basile le Grand a une mère, Emmélie, et trois frères
et sœurs qui sont saints comme lui ; Thérèse de Lisieux a ses parents, Louis et
Zélie Martin, canonisés en 2015, et sa sœur Léonie.

**Un second bouton**, à côté du premier, dans le violet des autres vies : « Voir
les 6 saints qu'il a pu croiser ». Pressé, il pose leurs croix sur la carte — la
sienne reste seule au premier plan — et déplie la liste sous lui. Chaque nom
s'ouvre : sa fiche prend la place, ses lieux et ses voisins à lui paraissent, et
l'on remonte ainsi une génération.

### Deux sortes, et deux tons

**Les liens attestés** viennent de Wikidata, qui les écrit noir sur blanc. Neuf
propriétés, posées des deux côtés — Wikidata n'en écrit souvent qu'un :

| propriété | ce qu'elle dit | le mot de la fiche | combien |
| --- | --- | --- | --- |
| P1066 | élève de | Son maître | 132 |
| P802 | a pour élève | Son disciple | 130 |
| P22, P25 | père, mère | Son père ou sa mère | 127 |
| P40 | enfant | Son enfant | 127 |
| P3373 | frère ou sœur | Frère ou sœur | 226 |
| P26 | conjoint | Son époux | 56 |
| P1038 | parent au sens large | De sa famille | 42 |
| P737 | influencé par | Il a inspiré ce saint | 19 + 19 |

**Les deux bouts doivent être au corpus.** Deux mille neuf cent trente-deux
liens ont été écartés pour cette seule raison : une fiche qui promet une fiche
absente est une porte peinte. Restent **878 liens entre 526 fiches**, qui
voyagent avec la table des lieux.

**Les rencontres possibles**, elles, ne sont écrites nulle part. Deux vies qui se
recouvrent d'au moins cinq ans, et un lieu que tous deux ont marqué à moins de
vingt-cinq kilomètres : c'est une conjecture, et la fiche la dit comme telle —
« a pu croiser » —, en nommant le lieu partagé pour qu'on juge sur pièce.
Beaucoup de fiches n'ont qu'une date ; on complète l'autre par soixante-dix ans,
convention qui ne sert qu'à écarter les siècles. Une fiche sans aucune date
n'entre pas dans le calcul, faute de quoi tout le monde aurait pu rencontrer tout
le monde.

Trois mille cinq cent vingt-trois saints ont au moins un voisin de ce genre, six
ou sept en moyenne. Rome en donnerait des centaines : on n'en garde que douze,
les plus proches d'abord, puis les vies qui se recouvrent le plus longtemps. Une
liste de deux cents noms ne se lit pas, et ne dit rien de plus.

### Rien de tout cela ne pèse au téléchargement

Le calcul se fait **dans le navigateur**, sur le corpus déjà en mémoire, par une
grille au quart de degré bâtie au premier saint dont on demande les voisins et
jetée dès que le corpus bouge. Dix mille cinq cents points à ranger, neuf cases à
lire par lieu : c'est instantané, et cela ne coûte pas un octet de plus.

Seuls les liens attestés voyagent, dans le fichier des lieux, qui descend déjà
après la carte.

### Ce que l'essai a corrigé

- **changer de saint remportait mal ce qui appartenait au précédent.** Ouvrir un
  voisin depuis la fiche laissait sur la carte les perles et les croix de celui
  qu'on venait de quitter, désormais au nom du nouveau ;
- **la légende ne se taisait pas** : elle continuait de nommer des perles que la
  carte avait remportées ;
- **quatre phrases parlaient de tout le monde au masculin.** « Voir les lieux
  qu'il a marqués » s'affichait sous le nom de Thérèse de Lisieux. Le système de
  traduction sait porter deux formes depuis le début — il servait aux titres et
  aux degrés —, il sert maintenant à ces phrases-là, dans les neuf langues qui
  en ont besoin. La ligne de légende, elle, ne parle d'aucun saint en
  particulier : elle a été récrite sans pronom.

## Trois corpus, une bascule

La carte montre les saints, ou les apparitions reconnues par l'Église, ou les
miracles eucharistiques — jamais deux à la fois. Trois boutons collés en haut de
la carte, « Saints », « Apparitions » et « Miracles », disent lequel des trois
est à l'écran et font passer de l'un à l'autre.

Le second corpus porte **quarante apparitions dans vingt-trois pays**, de
Saragosse — an 39 — à Assiout en l'an 2000 : Guadalupe, Le Laus, La Salette,
Lourdes, Pontmain, Knock, Fátima, Beauraing, Banneux, Akita, Kibeho,
Medjugorje. Vingt-deux d'entre elles ont été reconnues par l'Église, deux ne
l'ont pas été, une est à l'examen, et les quinze autres ne portent aucun mot :
l'Église ne s'est pas prononcée, et la fiche omet alors la ligne.

Tant qu'il était vide, la carte le disait en toutes lettres — « Aucune
apparition n'est encore recensée » —, et elle le dira de nouveau si le fichier
venait à manquer : une carte sans un seul repère ressemble trop à une carte en
panne.

Une apparition n'est pas un saint, et sa fiche ne fait pas semblant de l'être :

| la fiche d'un saint | celle d'une apparition |
| --- | --- |
| Reconnaissance — saint, bienheureux, vénérable | Approbation — reconnue, examen en cours, non reconnue |
| Naissance, Mort | Année, ou les deux bornes quand elles s'étalent |
| Lieu de naissance | Lieu |

Le repère garde en revanche la même forme : même médaillon, même écusson, même
croix, même encombrement — seule la couleur change, rouge des martyrs pour les
saints, bleu marial pour les apparitions, or des ostensoirs pour les miracles,
qui portent en outre une hostie au lieu d'une croix : la couleur se reconnaît
d'un coup d'œil, mais elle ne se lit pas quand on est daltonien, et le troisième
corpus avait de la place pour un signe. La légende suit la bascule.

## Les emblèmes

Chaque fiche porte une petite image, sur la carte, dans les listes et en tête de
la fiche. Ce n'est pas un portrait — aucune base n'en donne de libres pour
quatre mille saints — mais un **attribut**, comme les peintres l'ont toujours
fait : la tiare du pape, la palme du martyr, la couronne du roi, l'épée du
soldat, le livre du docteur, le rouleau de l'apôtre, la mitre de l'évêque, la
crosse de l'abbé, le lys de la vierge et de la moniale, le cœur enflammé du
mystique, l'église du fondateur, le chapelet du moine, la coquille du
missionnaire, le calice du prêtre, et le nimbe pour qui n'a pas d'autre titre.

Les apparitions disent **qui apparaît** (champ `qui` : `christ`, `ange`,
`saint`, la Vierge par défaut) : monogramme marial, Sacré-Cœur, ailes. Les
miracles portent l'ostensoir, et les cinq accusations de profanation un signe
d'avertissement (champ `nature: "calomnie"`), non l'ostensoir.

Tout tient dans `src/js/emblems.js` : des dessins au trait sur une grille de 24,
en `currentColor`, qui suivent le thème sans aucune image à télécharger. Un
repère qui regroupe plusieurs fiches garde la croix, faute de pouvoir dire
laquelle peindre.

## Les miracles eucharistiques

Le troisième corpus vient de l'**exposition « Les miracles eucharistiques dans
le monde »**, que Carlo Acutis a montée seul, sur son ordinateur, entre quatorze
et quinze ans, et qui a fait le tour du monde après sa mort en 2006. Il est
lui-même une fiche de cette carte, né à Londres en 1991 : la boucle se ferme.

**Cent quatre miracles, dix-huit pays**, des Pères du désert de Scété, vers 400,
à Legnica en 2013 — Lanciano, Bolsena, Santarém, Sienne, Daroca, Caravaca,
Faverney, Bruges, Liège, Amsterdam, Walldürn, Wilsnack, Seefeld, Ludbreg,
Cracovie, Chirattakonam, Buenos Aires, Tixtla, Sokółka. Ils sont **écrits à la main**,
dans `data/miracles/miracles.json` : aucune base ne tient cette liste, ni
Wikidata ni personne, et il n'y a donc pas d'importateur.

### Ce qu'on en garde

Une fiche de miracle ressemble à celle d'une apparition — une année, un lieu, un
récit — et ajoute un champ qui n'existe nulle part ailleurs : **ce qu'on en
garde**.

> **CE QU'ON EN GARDE** — La chair et cinq caillots de sang, à l'église
> Saint-François. Analysés en 1970-1971 par le professeur Odoardo Linoli : tissu
> du muscle cardiaque, sang humain de groupe AB, sans trace de conservateur.

Pour un fait du XIIIe siècle, ce n'est pas le récit qui décide qu'on y aille,
c'est de savoir s'il reste quelque chose à voir, et où : un corporal taché, une
hostie dans une ampoule, une procession qui se fait encore. Le champ le dit aussi
quand il ne reste rien — les saintes Formes d'Alcalá ont disparu en 1936, la
sainte Hostie de Douai à la Révolution.

### Les textes sont les nôtres

L'exposition est une œuvre, et elle est protégée. Les panneaux n'ont pas été
recopiés : chaque notice a été réécrite d'après ce que les sources rapportent. La
liste des lieux vient de l'exposition ; les mots n'en viennent pas.

### Ce qui n'y est pas, et pourquoi

L'exposition compte plus de cent trente panneaux ; toute sa liste est ici, à
trois choses près, qui se disent plutôt qu'elles ne se taisent :

1. **Ce que l'exposition range sous un seul panneau n'y est qu'une fois.**
   Offida (1273-1280), Meerssen (1222 et 1465), Valvasone et Gruaro, Buenos
   Aires (1992-1996) ne font qu'un point chacun. Les panneaux qui ne racontent
   pas un miracle en un lieu — les saints et l'Eucharistie, les introductions —
   n'en sont pas un non plus.

2. **Les fiches ajoutées en second ont été écrites plus court.** Le premier
   passage ne gardait que ce dont la date et le lieu étaient sûrs ; le second a
   voulu toute la liste. Quand les sources ne disaient presque rien — Asti,
   Benningen, Bergen, Pressac, le second miracle de Turin —, la notice dit peu,
   et le champ « ce qu'on en garde » se borne au souvenir. Elles sont à relire.

3. **Les récits d'hostie profanée par des Juifs sont sur la carte, mais pour ce
   qu'ils sont : des calomnies.** Paris 1290, Bruxelles 1370, Deggendorf 1338,
   Ségovie 1410, Poznań 1399 reposent sur une accusation portée au Moyen Âge
   contre des communautés juives, qui a servi de prétexte à des massacres. Les
   historiens la tiennent pour fausse, et l'Église l'a dit elle-même :
   l'archevêché de Malines-Bruxelles a reconnu en 1968 que le « Sacrement de
   Miracle » reposait sur une accusation sans fondement, et l'évêque de
   Ratisbonne a mis fin au pèlerinage de Deggendorf en 1992 pour la même raison.
   Ces cinq fiches ne sont donc pas titrées « miracle » : leur nom dit
   l'accusation, leur récit dit qu'elle est fausse et ce qu'elle a coûté, et
   « ce qu'on en garde » dit où l'on peut encore voir la légende — et, quand il
   existe, le désaveu.

### Ce que le troisième corpus a changé dans le code

Le passage de deux à trois a surtout consisté à **cesser de compter jusqu'à
deux**. `data.js` portait une quinzaine de « est-ce une apparition ? » : un index
par corpus, une couche locale par corpus, une bascule ternaire, un préfixe
d'identifiant. Tout cela se lit maintenant dans une table de trois lignes, et un
quatrième corpus serait une ligne de plus.

L'enregistrement local passe de la version 3 à la version 4 : la couche des
miracles s'ajoute, et un enregistrement écrit par la version d'avant la trouve
simplement vide — rien n'est perdu.

### D'où viennent les apparitions

De Wikidata, comme les saints, par `tools/import-apparitions.mjs` — et par
l'atelier `Importer les apparitions`, puisque Wikidata n'est pas joignable de
partout.

Une différence avec l'importateur des saints, et elle est voulue : celui-ci ne
recopie **aucun identifiant Wikidata de mémoire**. Un outil qui porte « les
instances de Q1132689 » est un outil qui se trompera un jour sans le dire : le
numéro est invérifiable à la lecture. Il *cherche* donc la classe — les éléments
nommés « Marian apparition », « apparition of the Virgin Mary »… — et ne garde
que ceux qui ont des instances, car une classe en a et une apparition
particulière n'en a pas. Les classes retenues sont annoncées dans le journal
avec leur nombre d'instances.

N'entre que ce qui est plaçable : des coordonnées — celles de l'événement, ou à
défaut celles du lieu —, un pays que la carte connaît, un point qui tombe
vraiment dans ce pays, une localité nommée, une année. Le reste est compté et
annoncé, non deviné.

**L'approbation, elle, ne s'importe pas.** Wikidata ne la porte pas de façon
fiable, et une carte qui déclarerait « reconnue » une apparition que l'Église n'a
pas reconnue dirait un faux sur un sujet où le faux coûte cher. L'outil ne pose
ce mot que lorsqu'un texte l'écrit en toutes lettres ;
`data/apparitions/approbations.json`, écrit à la main, tranche pour celles que
l'Église a nommées — Lourdes 1862, Fátima 1930, Kibeho 2001, Garabandal jamais —
et chaque ligne y porte sa raison. La table l'emporte sur l'import, et les motifs
qui ne servent à rien sont annoncés à la génération.

### Modifier, ajouter, supprimer une apparition

Depuis la carte, comme pour un saint. L'administrateur bascule sur
« Apparitions » et la partie « Ajouter » du tiroir change de visage : nom,
**année** et dernière année, **approbation**, lieu, coordonnées, notice, récit —
ni genre, ni naissance, ni mort, ni qualités, ni patronage, qui ne se disent pas
d'une apparition. La fiche ouverte porte « Modifier » et « Supprimer ».

Tout cela vit dans le navigateur, sur une **couche locale jumelle** de celle des
saints : deux couches dans le même enregistrement, non une seule et un champ
« genre ». Un identifiant retiré ne veut pas dire la même chose d'un corpus à
l'autre, et l'export de l'un ne doit pas emporter l'autre.

**Ce qui rend le travail durable**, c'est l'export, au bas du formulaire. Il rend
deux fichiers, qui sont exactement les deux que `build-data` relit :

| fichier | ce qu'il porte |
| --- | --- |
| `data/apparitions/apparitions.json` | les fiches ajoutées à la main |
| `data/apparitions/corrections.json` | ce qu'on a retouché d'une fiche importée, et ce qu'on en a retiré |

La distinction n'est pas une lubie d'archiviste. Une fiche importée est
**réécrite d'un bloc à chaque collecte** : corriger `wikidata.json` reviendrait à
perdre la correction au prochain import. Dans `corrections.json`, elle survit.

Et elle ne porte **que les champs touchés**. Le formulaire renvoie toujours tous
ses champs — c'est un formulaire —, mais la couche ne garde que ce qui diffère de
la fiche livrée : corriger une ville ne gèle ni la biographie, ni le jour de
fête, ni les sources, qui continuent de suivre Wikipédia. Une retouche qui revient
à la valeur d'origine s'efface d'elle-même.

Deux garde-fous à la génération : une correction qui nomme un identifiant inconnu
échoue bruyamment plutôt que de dormir dans le fichier, et une fiche corrigée est
relue avec la même sévérité qu'une fiche sortie de la collecte — une correction
qui viderait la localité ou déplacerait le point hors des bornes est refusée.

### Ce que la bascule ne touche pas

Rien d'autre que la carte. La recherche, le saint du jour, le rappel quotidien,
la lettre et la modération ne connaissent que les saints : ils lisent le même
index qu'avant, et n'ont rien à redessiner. Ce qui change, ce sont la couleur
des pays, les repères posés, le compte du pays ouvert et la légende — quatre
lectures, qui passent toutes par `pointsIn()` et `countryHasPoints()` au lieu de
`saintsIn()` et `countryHasSaints()`.

Deux corollaires, l'un et l'autre vérifiés au navigateur :

- **la fiche ouverte se referme** au changement de corpus. Elle parlerait sinon
  d'un saint dont la croix n'est plus sur la carte — le même défaut que quitter
  un pays sans la fermer ;
- **une adresse qui nomme une apparition fait basculer la carte.**
  `?saint=notre-dame-de-lourdes` ouvre la fiche *et* passe aux apparitions, sans
  quoi le lien mènerait à un repère absent.

Les trois gestes d'administration — modifier, supprimer, modérer — disparaissent
sur une fiche d'apparition. La couche locale est posée sur le corpus des saints :
une retouche d'apparition y disparaîtrait sans un mot. Le second corpus se
corrige dans `data/apparitions/`, dont le `README.md` décrit le format champ par
champ ; `npm run build:data` le valide et refuse de produire une carte fautive,
`npm run check` le revérifie — et vérifie surtout qu'aucune apparition ne porte
l'identifiant d'un saint, puisqu'une adresse ne peut désigner qu'une chose.

## Le bandeau se plie

Le bandeau de l'accueil — le titre, la phrase, sept liens d'index, les chiffres
du corpus, huit pays — prenait trois lignes en haut de l'écran. C'est beaucoup
pour une application dont le sujet est la carte, et qu'on ouvre pour la carte.

Il est désormais **replié** : ne reste que le titre et une flèche, et la carte
gagne cent vingt pixels — de 159 à 39 sur un écran large. Un clic sur le titre le
déplie, un autre le referme ; Entrée fait de même au clavier.

Le pli est un `<details>` du navigateur, non un calque posé par le code, et c'est
ce qui compte ici : **ce qu'il contient reste écrit dans la page**, servi tel
quel, lu par un moteur de recherche qui n'exécute rien. Plier n'est pas cacher —
les sept chemins vers les 4 589 fiches sont toujours là où un robot les lit.

## Le temps de chargement

Avant que la carte paraisse, l'application téléchargeait **cinq mégaoctets et
demi** : treize secondes en 4G, trente en 3G. Elle en télécharge aujourd'hui
**584 kilooctets**, et la carte est là en deux secondes.

| Avant la carte | Avant | Après |
| --- | --- | --- |
| Octets transférés | 5 751 ko | **584 ko** |
| 4G (4 Mb/s) | 12 952 ms | **2 112 ms** |
| 3G (1,6 Mb/s) | 29 595 ms | **4 596 ms** |

Mesuré au navigateur, réseau bridé par le protocole de mise au point de
Chrome, sur un écran de téléphone.

### Ce qui pesait, et ce qu'on en a fait

Le corpus faisait à lui seul quatre-vingt-treize pour cent du chargement. En le
pesant champ par champ, trois d'entre eux en font les trois quarts :

```
bio        2 258 ko  46,5 %
sources      921 ko  19,0 %
desc         328 ko   6,8 %
                     ——————
                      72,3 %
```

Or aucun des trois ne sert à dessiner la carte ni à chercher : ils ne
paraissent qu'une fois une fiche ouverte. `build:data` écrit donc deux
fichiers : `saints.json`, qui ne porte plus que de quoi placer les croix et
chercher — le patronage y reste, la recherche l'indexe —, et
`saints-texts.json`, que l'application va chercher **une fois la carte à
l'écran**.

Les textes se fondent alors dans les fiches déjà en place, sur les objets
eux-mêmes : tout ce qui en tient une — la carte, la recherche, une fiche
ouverte — voit le récit apparaître sans rien redemander. Une fiche ouverte dans
la seconde qui suit l'arrivée montre son nom, ses dates et son lieu, puis se
complète sous les yeux. Une fiche retouchée localement garde ce que
l'administrateur y a écrit : sa version l'emporte.

Le réservoir de l'assistant — `candidates.json`, 69 ko — ne part plus au
démarrage non plus : seul un administrateur l'ouvre, et il est demandé au
premier examen du réservoir.

### Ce que les outils y gagnent, et ce qu'ils y perdent

Rien, et c'est vérifié : `tools/lib/corpus.mjs` recolle les deux fichiers, et
tous les outils passent par lui. Le flux régénéré et les 4 628 fiches statiques
sont identiques au caractère près à ceux d'avant la coupure.

### Le serveur de développement compresse

`npm start` sert désormais le texte en gzip, comme l'hébergement en production.
Sans cela, mesurer le temps de chargement en local ne disait rien de ce que vit
un lecteur : le corpus fait cinq mégaoctets sur le disque et un mégaoctet et
demi sur le fil.

### Ce qui reste à gagner

Deux postes, mesurés, que je n'ai pas touchés :

- **Les douze fichiers de langue** partent tous au démarrage — 190 ko bruts,
  une cinquantaine compressés — alors qu'un seul s'affiche. Les charger à la
  demande suppose de rendre `setLanguage` asynchrone, ce qui touche une pièce
  que tout le reste appelle.
- **Le code de l'administrateur** — `admin.js`, `wiki.js`, `expert.js`,
  `addForm.js`, 66 ko bruts — part pour tout le monde. Un `import()` au premier
  affichage du panneau le réserverait à qui l'ouvre.

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

Le rôle se choisit dans la partie **Compte** du tiroir. Le code administrateur
au premier lancement est `laurier-encens-9038` ; l'application le rappelle tant
qu'il n'a pas été changé, ce qui se fait depuis le même onglet.

**Comment on réinitialise un code oublié.** Le code choisi n'existe nulle part
ailleurs que dans le navigateur de l'administrateur, rangé sous la clef
`sanctimaps.adminCode.v<n>` et sous forme d'empreinte : aucun serveur ne le
détient, et personne ne peut le relire — pas même en lisant ce dépôt. Le seul
moyen de l'effacer à distance est donc d'incrémenter le numéro de version de
cette clef dans `src/js/auth.js` : tous les navigateurs oublient alors ce qui
y était rangé et retombent sur le code d'origine. L'ancienne clef est effacée
au passage.

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
demandés, faute de quoi une biographie irait au mauvais saint. Sur les 4 343
fiches importées, 3 571 en ont reçu une ; les 285 fiches écrites à la main
sont pourvues à part, par l'outil décrit plus bas.

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

**4 628 saints répartis sur 91 pays** et les six continents, avec pour chacun
ses noms (français, anglais, latin quand il existe), ses dates, son lieu de
naissance rapporté au pays d'aujourd'hui, sa fête et souvent une notice. Deux
origines s'y mêlent :

| | | |
| --- | ---: | --- |
| Écrits à la main | 285 | notice rédigée, patronage attesté, latin systématique |
| Importés de Wikidata | 4 343 | l'adresse de l'élément d'origine accompagne chaque fiche |

S'y ajoutent 148 fiches candidates en réserve pour l'assistant et 293 fiches
de fond documentaire.

**3 843 fiches sur 4 628 — 83 % — portent une biographie**, c'est-à-dire un
récit de quelques phrases sous les dates, et non la seule notice d'une ligne.
L'introduction de l'article est réduite à trois phrases, coupée en fin de
phrase et plafonnée à six cents caractères, ce qui donne 304 caractères en
moyenne. Les fiches écrites à la main sont pourvues à 272 sur 285.

**3 838 le sont en français** — c'est ce que lit un lecteur français, puisque
la fiche ne lui sert pas d'anglais. Elles n'étaient que 3 300 : les 543 fiches
qui n'avaient d'article qu'en anglais ont été traduites, moins cinq dont le
texte anglais parlait de quelqu'un d'autre (voir « Les biographies traduites »).
Restent 785 fiches sans récit dans aucune des deux langues, ou dont
l'appariement n'était pas assez sûr. Une fiche sans récit vaut mieux qu'une
fiche avec le récit d'un autre, et qu'une fiche à demi traduite. L'attribution
CC BY-SA voyage avec le texte, dans les sources de la fiche.

234 de ces saints portent en plus un patronage — ce dont ils sont patrons —
tenu à part dans `data/saints/patronages.json` et fusionné à la génération.
Seuls les patronages bien attestés y figurent : un saint sans entrée n'affiche
simplement pas la ligne « Saint patron de », ce qui vaut mieux qu'un patronage
inventé pour remplir la case.

Le lieu retenu est celui de la **naissance**, situé dans le pays actuel : Édith
Stein est née à Breslau, donc en Pologne ; Ambroise de Milan à Trèves, donc en
Allemagne. Les dates antérieures au haut Moyen Âge sont souvent traditionnelles
plutôt qu'établies ; elles sont alors marquées « vers ».

### Une année, un siècle : dire ce que la source sait

Wikidata ne connaît souvent des saints anciens que le **siècle**. Elle
l'enregistre comme une année ronde — « +0200 » — assortie d'une *précision*
qui vaut 7 au lieu de 9. Lire l'année seule et afficher « vers 200 » serait une
fausse exactitude : la source ne dit pas 200, elle dit « IIe siècle ». La fiche
le dit donc ainsi.

La précision voyage avec la fiche (`bornPrec`, `diedPrec`), et l'affichage la
respecte :

| Précision | Ce que la fiche montre |
| ---: | --- |
| 9 et plus | l'année — `1226`, ou `vers 1226` si la date est traditionnelle |
| 8 | la décennie — `années 1250` |
| 7 | le siècle — `IIe siècle`, `IIe siècle av. J.-C.` |
| 6 | le millénaire |

Sur les 4 343 fiches importées, **797 sont datées au siècle**, 35 au millénaire
et 75 à la décennie : autant d'années qui n'ont jamais été dites et qui ne
sont plus affichées.

Chaque langue a sa formule : « IIe siècle », « 2nd century », « 2.
Jahrhundert », « saeculum II », « siglo II », « II век » — le rang en chiffres
romains, arabes ou en ordinal selon l'usage, et « Ier » et non « Ie » au premier
rang. **« Vers » ne se dit plus que d'une année** : un siècle n'est pas une date
approchée, c'est une autre échelle.

Une conséquence moins attendue : le contrôle « mort avant la naissance »
écartait des fiches saines. Né « au IIe siècle » enregistré 200, mort en 187 :
rien d'incohérent, puisque la naissance ne voulait dire que le siècle. La
comparaison se fait donc à la maille la plus grossière des deux dates.

Le corpus est déséquilibré, et c'est fidèle : 190 saints en Europe contre deux
en Océanie. C'est la géographie réelle des canonisations, pas une lacune de
collecte.

### Le français d'abord, et rien d'autre

Le corpus ne porte de la prose qu'en deux langues : le français, qu'il écrit,
et l'anglais, qu'il rapporte de Wikipédia. Servir l'anglais à qui lit en
français n'est pas rendre service — une notice « Italian Roman Catholic
bishop » sous un nom français se remarque plus qu'elle n'instruit. **Dans ces
deux langues, la fiche montre ce qu'elle a dans cette langue, ou rien.** Les
dix autres langues de l'interface n'ont aucune prose à leur nom : leur refuser
le repli les priverait de tout, elles gardent donc le français puis l'anglais.

Le nom suit la même règle, mais l'import a de quoi faire mieux que se taire :
quand Wikidata n'a pas de libellé français, **le titre de l'article français
en tient lieu**, débarrassé de sa parenthèse de désambiguïsation. « Romulus de
Fiesole » vaut mieux que « Romulus of Fiesole », et « Daniel (prophète) » se
lit « Daniel ». Reste ce que Wikimedia n'a en aucune forme française : ces
noms-là restent tels quels, faute de pouvoir les inventer.

### Importer en masse depuis Wikidata

Le corpus écrit à la main compte 285 fiches ; l'import de Wikidata en a
ajouté **4 343**, portant la carte à **4 628 saints dans 91 pays**. L'outil
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
node tools/enrich-bios.mjs --no-search    # libellé exact seulement
npm run build:data && npm run check       # puis, toujours
```

Depuis GitHub, c'est l'atelier *Donner une biographie aux fiches écrites à la
main*, dans l'onglet **Actions**, avec les mêmes contrôles et le même versement
au dépôt que l'import. Il a pourvu **272 de ces 285 fiches** ; les 13 autres
n'ont pas trouvé de candidat assez sûr, et restent à leur notice.

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

**Deux passages, parce que les noms ne tombent pas toujours juste.** Le corpus
dit « Patrick », « Boniface », « Louis IX » ; Wikidata range ces saints sous
« Patrick d'Irlande », « Boniface de Mayence », « Louis IX de France ». Le
libellé exact ne les trouve pas, et ce sont des saints majeurs. Les fiches
restées sans candidat repassent donc par la recherche par mots de Wikidata,
qui accepte le nom approché. Ce second passage élargit ce que l'on **regarde**,
jamais ce que l'on **retient** : les candidats trouvés subissent la même
notation, le même seuil et la même règle du doute, avec un plancher de plus —
un mot substantiel du nom doit se retrouver dans le libellé, faute de quoi une
recherche indulgente ramènerait n'importe qui.

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
src/js/ui/fiche.js       la fiche de la moitié du bas, et sa place face à la carte
src/js/ui/reminder.js    rappel quotidien : agenda, réveil, notification, lettre
src/js/background.js     le réveil quotidien, et les cinq états qu'il peut prendre
src/js/install.js        installation sur l'écran d'accueil, et le service worker
src/js/ui/install.js     la partie « Ajouter à l'écran d'accueil » des réglages
sw.js                    réseau d'abord, cache en secours, et le réveil quotidien
src/js/wiki.js           recherche sur Wikidata et Wikipédia, depuis le navigateur
src/js/ui/*.js           panneau, recherche, fiche, formulaire, modération,
                         assistant, compte, bandeau
data/saints/*.json       corpus, écrit à la main
data/saints/patronages.json  patronages, indexés par identifiant
data/apparitions/*.json  second corpus : les apparitions
data/apparitions/README.md   son format, champ par champ
data/apparitions/approbations.json  ce que l'Église en a dit, écrit à la main
data/apparitions/corrections.json   retouches et retraits, exportés depuis la carte
tools/import-apparitions.mjs  les apparitions, importées de Wikidata
tools/import-lieux.mjs   les lieux qu'un saint a marqués, relevés sur Wikidata
data/saints/lieux.json   ce qu'ils rendent : sépulture, mort, fondation, œuvre, résidence
data/generated/lieux.json    les mêmes, placés, chargés après la carte
data/candidats/*.json    réservoir de l'assistant
data/reference/fond-*.json   fond documentaire de l'expert, 148 fiches complètes
data/reference/exonymes.json graphies acceptées pour les localités
data/saints/biographies.json biographies rapportées pour les fiches écrites à la main
data/saints/traductions.json biographies traduites de l'anglais, et les cinq écartées
data/generated/          données produites par build:data (versionnées)
data/generated/saints.json       les fiches allégées : de quoi dessiner et chercher
data/generated/saints-texts.json les textes longs, chargés après la carte
data/generated/apparitions.json  le second corpus, validé et projeté
tools/lib/corpus.mjs     recolle les deux, pour les outils qui lisent le corpus
tools/build-pages.mjs    pages indexables : saints/, pays/, lieux/, epoques/, calendrier/, lettre/
tools/audit-lieux.mjs    ce que valent les lieux et les noms du corpus
tools/audit-doublons.mjs deux fiches pour la même personne, et ce qui leur ressemble
data/reference/doublons.json  les fusions tranchées, et les ressemblances gardées
tools/import-statuts.mjs le statut de canonisation, relevé sur Wikidata (P411)
data/saints/statuts.json      serviteur, vénérable, bienheureux ou saint, par fiche
tools/completer-bios.mjs une biographie pour les fiches qui n'en ont dans aucune des deux langues
data/saints/bios-importees.json  ce qu'il rapporte, langue par langue
tools/make-icons.mjs     les icônes du site, tirées du logo
tools/build-feed.mjs     la lettre quotidienne, au format Atom
tools/send-letter.mjs    la même lettre, remise à un routeur de courriel
tools/lib/lettre.mjs     le texte de la lettre, écrit une fois pour les deux
tools/lib/mailers.mjs    Brevo, Resend, Mailjet : ce qui change de l'un à l'autre
feed.xml                 la lettre elle-même, réécrite chaque matin
lettre/index.html        comment s'y abonner
data/generated/calendar.json  calendrier abrégé, lu par le service worker
tools/lib/png.mjs        lire et écrire un PNG avec le seul zlib de Node
data/brand/logo.png      le logo d'origine
icons/                   icônes produites, servies telles quelles
saints/ pays/ lieux/ calendrier/  pages générées, un dossier par adresse (versionnées)
tools/import-saints.mjs  import de masse depuis Wikidata
tools/enrich-bios.mjs    biographies des fiches écrites à la main
tools/lib/wikimedia.mjs  ce que les deux outils Wikimedia ont en commun
.github/workflows/       import et contrôles à la demande ; la lettre chaque matin
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
recherche — où l'on écrit un pays, un siècle, une date ou un nom — et par le
fil d'Ariane ; les points de naissance des saints, eux, sont focalisables et
s'ouvrent avec `Entrée`.

**Une réserve, et il faut la dire** : les puces de continents qui bordaient le
haut de la carte ont été retirées, et avec elles le seul moyen d'aller
directement à un continent sans souris. On y arrive encore par la recherche —
écrire « Italie » ouvre le pays, donc l'Europe — mais c'est un détour. Si la
place manque au-dessus de la carte, la place ne manque pas dans le tiroir.

## Sources

- Contours : [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, domaine public)
- Métadonnées des pays : [world-countries](https://github.com/mledoze/countries) (ODbL)
- Villes : [all-the-cities](https://github.com/zeke/all-the-cities) (GeoNames, CC BY 4.0)
