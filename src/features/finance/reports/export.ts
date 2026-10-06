import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { toast } from '@/lib/toast';
import { todayISO, day } from '@/lib/ledger';
import type { CsvCell, Statement } from './types';

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A statement as CSV lines: title, basis, blank, header, rows. Section rows carry only their label. */
export const statementCsv = (title: string, basis: string, t: Statement): CsvCell[][] => [
  [title],
  [basis],
  [],
  t.columns.map((c) => c.label),
  ...t.rows.map((r) =>
    r.kind === 'section'
      ? [r.cells[0]]
      : r.cells.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)),
  ),
];

const esc = (v: CsvCell) => {
  if (v == null) return '';
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** BOM + CRLF, the same file the web downloads, so Excel opens it as UTF-8. */
export const toCsv = (lines: CsvCell[][]) => '﻿' + lines.map((r) => r.map(esc).join(',')).join('\r\n');

export async function shareCsv(name: string, lines: CsvCell[][]) {
  try {
    const path = `${FileSystem.cacheDirectory}truckwys-${slug(name)}.csv`;
    await FileSystem.writeAsStringAsync(path, toCsv(lines), { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    } else {
      toast.info('Sharing not available');
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not export CSV');
  }
}

// ── print / PDF ─────────────────────────────────────────────────────────────

const html = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The CSV lines as a printable page. The CSV already holds the report exactly as
 * the statement reads (title, basis, header row, rows, totals), so print renders
 * that rather than keeping a second layout in step with every report.
 */
export function reportHtml({
  company,
  title,
  sub,
  lines,
}: {
  company?: string;
  title: string;
  sub?: string;
  lines: CsvCell[][];
}) {
  // Blank lines split the CSV into blocks; a block with one cell per line is a heading.
  const blocks: CsvCell[][][] = [[]];
  for (const l of lines) {
    if (!l.length || l.every((c) => c === '' || c == null)) {
      if (blocks[blocks.length - 1]!.length) blocks.push([]);
    } else {
      blocks[blocks.length - 1]!.push(l);
    }
  }
  const num = (v: CsvCell) => typeof v === 'number' || (typeof v === 'string' && /^[\s\-−(]*[R\d][\d\s.,)]*%?$/.test(v) && v.trim() !== '');
  const body = blocks
    .filter((b) => b.length)
    .map((b) => {
      if (b.every((r) => r.length === 1)) {
        return b.map((r) => `<p class="note">${html(r[0])}</p>`).join('');
      }
      const [head = [], ...rows] = b;
      const width = head.length;
      return `<table><thead><tr>${head
        .map((h, i) => `<th class="${i ? 'n' : ''}">${html(h)}</th>`)
        .join('')}</tr></thead><tbody>${rows
        .map((r) =>
          r.length === 1
            ? `<tr class="sec"><td colspan="${width}">${html(r[0])}</td></tr>`
            : `<tr>${Array.from({ length: width }, (_, i) => {
                const v = r[i];
                const text = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;
                return `<td class="${i && num(v) ? 'n' : ''}">${html(text)}</td>`;
              }).join('')}</tr>`,
        )
        .join('')}</tbody></table>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;margin:24px;font-size:11px}
  h1{font-size:18px;margin:0 0 2px} .co{font-size:11px;color:#555;margin:0 0 2px} .sub{color:#555;margin:0 0 14px}
  .note{color:#555;margin:2px 0}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  th,td{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-weight:600} .n{text-align:right;white-space:nowrap}
  tr.sec td{font-weight:700;background:#fafafa}
</style></head><body>
${company ? `<p class="co">${html(company)}</p>` : ''}
<h1>${html(title)}</h1>
<p class="sub">${html(sub ?? '')}${sub ? ' · ' : ''}Printed ${html(day(todayISO()))}</p>
${body}
</body></html>`;
}

/** Opens the system print dialog (Print / Save as PDF on iOS and Android). */
export async function printReport(args: Parameters<typeof reportHtml>[0]) {
  try {
    await Print.printAsync({ html: reportHtml(args) });
  } catch (e) {
    // Dismissing the print dialog throws on some platforms; that is not an error.
    const msg = e instanceof Error ? e.message : '';
    if (!/cancel|did not complete/i.test(msg)) toast.error(msg || 'Could not print');
  }
}

/** Renders the report to a PDF file and opens the share sheet. */
export async function sharePdf(args: Parameters<typeof reportHtml>[0], name: string) {
  try {
    const { uri } = await Print.printToFileAsync({ html: reportHtml(args) });
    const target = `${FileSystem.cacheDirectory}truckwys-${slug(name)}.pdf`;
    await FileSystem.copyAsync({ from: uri, to: target });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(target, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } else {
      toast.info('Sharing not available');
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not create PDF');
  }
}
