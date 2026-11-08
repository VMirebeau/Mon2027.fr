/// Arrondis « propres » des valeurs placées sur une échelle continue.
///
/// Les questions « Placer sur une échelle » (curseur_multi) n'ont pas de pas
/// dans leur type (cf. CurseurMultiQuestion) : on en dérive un de la plage,
/// ~1 % de l'étendue arrondi à une valeur ronde (… 0,1 · 0,2 · 0,5 · 1 · 2 ·
/// 5 · 10 …). Assez fin pour placer à l'œil (une centaine de crans), assez
/// grossier pour ne plus envoyer des positions comme 11.98263708750407.

/// Pas « rond » d'environ 1 % de l'étendue.
export function niceStepForSpan(span: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const target = span / 100;
  const mag = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 5, 10]) {
    const s = Number((m * mag).toPrecision(12));
    if (s >= target - 1e-12) return s;
  }
  return Number((10 * mag).toPrecision(12));
}

/// Nombre de décimales d'un pas (0,05 → 2 · 0,5 → 1 · 5 → 0).
export function stepDecimals(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0;
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/// Arrondit `v` au multiple de `step` le plus proche, borné à [min, max] si
/// fournis, sans résidu flottant (0.1 + 0.2 ne sort pas en 0.30000000000000004).
export function roundToStep(v: number, step: number, min?: number, max?: number): number {
  if (!Number.isFinite(v)) return v;
  const snapped = step > 0 ? Math.round(v / step) * step : v;
  let out = snapped;
  if (typeof min === "number") out = Math.max(min, out);
  if (typeof max === "number") out = Math.min(max, out);
  return Number(out.toFixed(Math.max(stepDecimals(step), decimalsOf(min), decimalsOf(max))));
}

/// Décimales d'une borne (une plage [0,5 ; 9,5] garde sa précision une fois
/// bornée), plafonnées pour rester raisonnable.
function decimalsOf(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || Number.isInteger(v)) return 0;
  const s = String(v);
  const i = s.indexOf(".");
  return i === -1 ? 0 : Math.min(6, s.length - i - 1);
}
