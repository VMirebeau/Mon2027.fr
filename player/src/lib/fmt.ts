export function fmt(value: number | string, unit?: string): string {
  if (typeof value !== "number") return value;
  if (unit && unit.includes("€")) {
    return (
      value.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) +
      " " +
      unit.replace("€/mois (net)", "€").trim()
    );
  }
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  const formatted = rounded.toLocaleString("fr-FR").replace(".", ",");
  return formatted + (unit ? " " + unit : "");
}

/** Mode comparatif : une estimation_numerique dont la plage est signée
 *  (négatif → positif) représente un ratio comparatif (« N× moins / autant /
 *  N× plus ») plutôt qu'une magnitude absolue. Le player détecte ce mode
 *  uniquement via le signe de la plage — pas de flag DB nécessaire. */
export function isComparativeEstimation(range: [number, number]): boolean {
  return range[0] < 0 && range[1] > 0;
}

/** Découpe l'affichage comparatif en {main, suffix} pour permettre aux
 *  composants de styler chiffre et direction différemment (gros/petit).
 *  Le « cœur » [-1, 1] est traité comme « à peu près autant » : ça évite
 *  l'absurdité d'un « 0,5× moins » et donne au joueur une zone neutre
 *  claire au centre du slider. */
export function fmtComparative(
  val: number,
  step: number,
): { main: string; suffix: string } {
  const abs = Math.abs(val);
  // « autant » est rendu seul en main, sans préfixe glyphe ni suffix : ça
  // évite à la fois le « ≈ » disgracieux et le saut de taille de police
  // (64 ⇆ 96) qui provoquait un layout shift dès qu'on quittait le centre.
  if (abs < 1) return { main: "autant", suffix: "" };
  const direction = val < 0 ? "moins" : "plus";
  // « 7,0× » est inutile : si la valeur tombe pile sur un entier, on l'affiche
  // sans décimale même quand step < 1. Évite le décimal traînant sur les
  // valeurs entières dans une plage à pas 0,5.
  const num =
    step >= 1 || Number.isInteger(abs)
      ? Math.round(abs).toString()
      : abs.toFixed(1).replace(".", ",");
  return { main: num + "×", suffix: direction };
}

/** Formate une borne (min/max de plage) ou une valeur révélée pour
 *  les libellés courts (labels de slider, axe reveal). */
export function fmtEstimationValue(
  val: number,
  range: [number, number],
  unit: string,
  step: number,
): string {
  if (isComparativeEstimation(range)) {
    const { main, suffix } = fmtComparative(val, step);
    return suffix ? `${main} ${suffix}` : main;
  }
  return fmt(val, unit);
}
