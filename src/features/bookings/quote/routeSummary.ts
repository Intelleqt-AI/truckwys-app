// A route option's chip text from the backend's toll_summary
// ("Fastest · via N17/N3 (Gosforth Ramp (W), Wilge, Tugela, Mooi) · tolls R 1 020").
// Pure, no imports: runs under `node --test`.

export interface RouteChipText {
  /** "Fastest · via N17/N3" */
  title: string;
  /** "tolls R 1 020" / "tolls unknown" / "no toll plazas" */
  tolls: string | null;
  /** The plazas, for the accessibility label. */
  plazas: string | null;
}

/** Null when there's no toll_summary (older backend): the chip keeps its own text. */
export function routeChipText(summary: unknown): RouteChipText | null {
  if (typeof summary !== 'string' || !summary.trim()) return null;
  const parts = summary.split(' · ').map((p) => p.trim());
  const head = parts[0] ?? '';
  const via = parts.length > 2 ? parts.slice(1, -1).join(' · ') : (parts[1] ?? '');
  const tolls = parts.length > 1 ? (parts[parts.length - 1] ?? null) : null;
  const m = via.match(/^(via [^(]+?)\s*\((.*)\)\s*$/);
  const viaShort = m ? m[1]!.trim() : via;
  return {
    title: [head, viaShort].filter(Boolean).join(' · '),
    tolls: parts.length > 2 || /toll/i.test(tolls ?? '') ? tolls : null,
    plazas: m ? m[2]!.trim() : null,
  };
}
