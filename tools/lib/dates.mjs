/**
 * Comparer deux dates qui ne sont pas de la même finesse.
 *
 * « Mort avant sa naissance » est un contrôle simple tant que les deux dates
 * sont des années. Il cesse de l'être dès que l'une n'est connue qu'au siècle :
 * Wikidata enregistre alors une année ronde — souvent la dernière du siècle —
 * et l'on se retrouve avec un saint « né en 200, mort en 187 » qui n'a rien
 * d'incohérent, puisque la naissance voulait seulement dire « au IIe siècle ».
 *
 * On compare donc à la maille la plus grossière des deux : deux siècles entre
 * eux, un siècle et une année ramenée à son siècle. Une fiche n'est écartée
 * que si l'ordre est impossible à cette maille-là — ce qui reste vrai des
 * fiches réellement fautives, et cesse de l'être des fiches simplement floues.
 */

/** Wikidata compte 6 le millénaire, 7 le siècle, 8 la décennie, 9 l'année. */
const YEAR = 9;

const bucket = (year, precision) => {
  if (precision >= YEAR) return year;
  if (precision === 8) return Math.floor(year / 10);
  if (precision === 7) return Math.ceil(Math.abs(year) / 100) * Math.sign(year || 1);
  return Math.ceil(Math.abs(year) / 1000) * Math.sign(year || 1);
};

export function coherent(born, died, bornPrec = YEAR, diedPrec = YEAR) {
  if (born == null || died == null) return true;
  const prec = Math.min(bornPrec ?? YEAR, diedPrec ?? YEAR);
  return bucket(died, prec) >= bucket(born, prec);
}
