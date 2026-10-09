// The confirm-before-save message for a fuel price change in Settings
// (diesel or petrol: mode, own price or official grade). Pure.

export interface FuelChoice {
  /** 'OWN' = the fleet's own price; 'LIVE' = the official price. */
  mode: 'LIVE' | 'OWN';
  /** R/L this choice prices on; null when unknown. */
  price: number | null;
  /** Petrol only: the official grade. */
  grade?: '95' | '93' | null;
}

const r2 = (n: number) => `R ${n.toFixed(2).replace('.', ',')}`;

const describe = (fuel: 'diesel' | 'petrol', c: FuelChoice) =>
  c.mode === 'OWN'
    ? `your own ${fuel} price`
    : fuel === 'petrol' && c.grade
      ? `the official ULP ${c.grade} price`
      : `the official ${fuel} price`;

/**
 * Null when nothing that prices quotes changed. Otherwise the alert text and
 * the confirm button label, e.g. "New quotes will use your own diesel price of
 * R 29,11/L instead of the official R 32,80/L (R 3,69/L less). …".
 */
export function fuelChangeMessage(
  fuel: 'diesel' | 'petrol',
  from: FuelChoice,
  to: FuelChoice,
): { title: string; message: string; confirm: string; saved: string } | null {
  const same =
    from.mode === to.mode &&
    (to.mode === 'OWN' ? from.price === to.price : (from.grade ?? null) === (to.grade ?? null));
  if (same) return null;
  const toText = describe(fuel, to);
  const fromText =
    from.mode === 'OWN' ? 'your own' : fuel === 'petrol' && from.grade ? `the official ULP ${from.grade}` : 'the official';
  let line = `New quotes will use ${toText}`;
  if (to.price !== null) line += ` of ${r2(to.price)}/L`;
  if (from.price !== null) {
    line += ` instead of ${from.mode === to.mode && to.mode === 'OWN' ? '' : `${fromText} `}${r2(from.price)}/L`;
    if (to.price !== null && Math.abs(to.price - from.price) >= 0.005) {
      line += ` (${r2(Math.abs(to.price - from.price))}/L ${to.price < from.price ? 'less' : 'more'})`;
    }
  }
  line += '. Quotes already sent keep their price; open drafts update when you open them.';
  const use = to.mode === 'OWN' && to.price !== null ? r2(to.price) : to.grade && fuel === 'petrol' ? `ULP ${to.grade}` : 'official';
  return {
    title: fuel === 'diesel' ? 'Change your diesel price?' : 'Change your petrol price?',
    message: line,
    confirm: `Save and use ${use}`,
    saved: `Saved. New quotes use ${to.mode === 'OWN' && to.price !== null ? `${r2(to.price)}/L` : describe(fuel, to)}.`,
  };
}
