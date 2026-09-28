# Les miracles eucharistiques

Ce dossier tient le troisième corpus de la carte. Il vient de l'**exposition
« Les miracles eucharistiques dans le monde »**, que Carlo Acutis a montée seul,
sur son ordinateur, entre quatorze et quinze ans, et qui a fait le tour du monde
après sa mort en 2006. Il est lui-même une fiche de la carte, né à Londres en
1991 : la boucle se ferme.

Un seul fichier, une seule main : `miracles.json`. Aucune base ne tient cette
liste — ni Wikidata, ni personne —, et il n'y a donc pas d'importateur. Ce qui
est ici a été écrit à la main, fiche par fiche.

## Ce qu'une fiche porte

| champ | ce qu'il dit |
| --- | --- |
| `annee` | l'année du fait, telle que la tradition la donne |
| `city`, `country`, `lat`, `lng` | où |
| `desc` | ce qui s'est passé, en quelques lignes |
| `garde` | **ce qu'on en garde encore** : une chair, un corporal, une hostie, une procession, ou rien |

Le champ `garde` est propre à ce corpus, et c'est le plus utile : pour un
miracle du XIIIe siècle, ce qui compte n'est pas seulement le récit, c'est de
savoir si l'on peut encore aller voir quelque chose, et où. Il dit aussi quand il
ne reste rien — les saintes Formes d'Alcalá ont disparu en 1936, la sainte Hostie
de Douai à la Révolution.

## Le lien vers l'exposition

Chaque fiche renvoie, sous « Sources », au site de l'exposition —
[miracolieucaristici.org](https://www.miracolieucaristici.org/fr/Liste/list.html) —,
où l'on trouve les panneaux d'origine. Le lien est posé à la construction, par
`tools/build-data.mjs` : il n'est pas à écrire fiche par fiche, et une fiche qui
porte son propre champ `sources` le remplace.

## Les textes sont les nôtres

L'exposition est une œuvre, et elle est protégée. Les panneaux n'ont donc pas
été recopiés : chaque notice a été réécrite d'après ce que les sources
rapportent. La liste des lieux vient de l'exposition ; les mots n'en viennent
pas.

## Ce qui n'y est pas, et pourquoi

**L'exposition compte plus de cent trente panneaux ; il y a ici cent quatre
miracles, dans dix-huit pays** — des Pères du désert de Scété, vers 400, à
Legnica en 2013. La liste de l'exposition y est entière, à trois choses près,
qui se disent :

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

## Ajouter, modifier, supprimer

Comme pour les deux autres corpus, tout se fait **depuis l'application** :
connectez-vous en administrateur, basculez la carte sur « Miracles », et servez-
vous de la partie « Ajouter » du tiroir. Le travail vit d'abord dans votre
navigateur ; le bouton d'export, au bas du formulaire, rend les fichiers à
verser ici.
