/** Smallest "nice" step (1, 2, 2.5, 5 × 10^k) so `steps` of it cover `max`. */
export function niceStep(max: number, steps: number): number {
  const raw = Math.max(max, 1e-9) / steps;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

/** Whole rand with no cents, for readouts ("R 127 621", negatives "−R 4 200"). */
export { moneyWhole as rand } from '@/lib/ledger';
