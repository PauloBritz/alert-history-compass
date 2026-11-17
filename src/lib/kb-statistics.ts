/** Preserved legacy percentage helper; active V2 statistics come from Python. */
export function taxaSucesso(pos: number, neg: number): number | null {
  const total = pos + neg;
  return total === 0 ? null : Math.round((pos / total) * 100);
}