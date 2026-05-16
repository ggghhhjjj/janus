export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function roundTo(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
