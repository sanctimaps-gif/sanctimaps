# Les apparitions

Ce dossier tient le second corpus de la carte : les apparitions mariales et
christiques reconnues par l'Église catholique. Il est **vide pour l'instant** —
la bascule de la carte existe, le corpus reste à écrire — et c'est dit en toutes
lettres à l'écran plutôt que laissé à deviner devant une carte sans repères.

Une apparition n'est pas un saint : elle n'est pas née et n'est pas morte, elle
a eu lieu. Elle porte donc une **année** et non deux dates, un **lieu** et non
un lieu de naissance, et un **degré de reconnaissance** qui n'est pas celui des
causes de canonisation — Lourdes et Fátima sont reconnues par l'Église,
Medjugorje ne l'est pas.

## Un fichier, un format

Autant de fichiers `.json` qu'on veut, chacun de la forme :

```json
{
  "apparitions": [
    {
      "id": "notre-dame-de-lourdes",
      "name": { "fr": "Notre-Dame de Lourdes", "en": "Our Lady of Lourdes" },
      "country": "FRA",
      "city": "Lourdes",
      "lat": 43.0959,
      "lng": -0.0457,
      "annee": 1858,
      "anneeFin": 1858,
      "approbation": "reconnue",
      "feast": "02-11",
      "desc": { "fr": "Dix-huit apparitions à Bernadette Soubirous." },
      "bio": { "fr": "…" },
      "sources": [{ "label": "Wikipédia", "url": "https://fr.wikipedia.org/wiki/…" }]
    }
  ]
}
```

| champ | obligatoire | ce qu'il dit |
| --- | --- | --- |
| `id` | oui | identifiant en minuscules, unique dans tout le dossier ; c'est l'adresse de la fiche |
| `name` | oui | le nom, par langue (`fr`, `en`, `la`…) ou une seule chaîne |
| `country` | oui | code ISO à trois lettres, connu de la carte |
| `city` | oui | la localité, telle qu'on l'écrit sur une carte |
| `lat`, `lng` | oui | le lieu, en degrés ; `x` et `y` sont calculés par `build-data` |
| `annee` | oui | l'année de l'apparition — ou de la première, quand il y en eut plusieurs |
| `anneeFin` | non | l'année de la dernière, quand elles s'étalent |
| `approbation` | non | `reconnue`, `en-cours`, `non-reconnue` ; rien quand on l'ignore |
| `feast` | non | `MM-JJ`, le jour de la fête liturgique quand il y en a une |
| `desc` | non | une phrase, par langue |
| `bio` | non | le récit, par langue |
| `sources` | non | `{ label, url }` ; obligatoire en pratique si `bio` est repris d'ailleurs |

`tools/build-data.mjs` contrôle tout cela et refuse de produire une carte sur un
corpus fautif ; `tools/check-data.mjs` le revérifie après coup. Ce qui est
rapporté d'un texte sous licence — Wikipédia — se cite : la source n'est pas une
politesse, c'est la condition de la reprise.

## Ce qui n'est pas ici

Les sanctuaires sans apparition, les miracles eucharistiques, les reliques : ce
sont trois autres corpus, et les mélanger ferait une carte dont on ne saurait
plus ce qu'elle montre.
