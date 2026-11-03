export const MAX_WEIGHT_LB = 99999999.99;

/** Arrow movement is one pound; stored/typed weights still allow hundredths. */
export function stepWeight(value: string, direction: 1 | -1): string {
  const weight = Number(value);
  if (!Number.isFinite(weight)) return value;

  // Work in hundredths to avoid floating-point drift in repeated clicks.
  const next = Math.round(weight * 100) + direction * 100;
  const bounded = Math.max(0, Math.min(Math.round(MAX_WEIGHT_LB * 100), next));
  return String(bounded / 100);
}
