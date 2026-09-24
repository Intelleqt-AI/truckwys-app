import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
}

/**
 * A picked file -> the tab-separated text a paste from the same file's rows
 * would have produced. Mirrors the web's PasteImportDrawer/fileToText: every
 * format converges on this one shape, so a file and a paste both go through
 * one validation and one preview.
 */
export async function fileToText(file: PickedFile): Promise<string> {
  // Name-based check first, but some document providers report a .csv/.tsv
  // as a generic "text/*" or CSV-alias MIME type without a matching name —
  // or vice versa, keep the extension but report application/octet-stream —
  // so either signal is enough to treat it as plain text.
  const CSV_TSV_MIME = new Set([
    'text/csv',
    'text/comma-separated-values',
    'text/x-comma-separated-values',
    'application/csv',
    'text/x-csv',
    'application/x-csv',
    'text/tab-separated-values',
    'text/tsv',
  ]);
  const isPlainText =
    /\.(csv|tsv|txt)$/i.test(file.name) ||
    (!!file.mimeType && (CSV_TSV_MIME.has(file.mimeType) || file.mimeType.startsWith('text/')));
  if (isPlainText) {
    const text = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!text.trim()) throw new Error('That file looks empty');
    return text;
  }

  // Anything else falls through to the spreadsheet reader below. Reject
  // early if the name has a recognisable but unsupported extension, so the
  // error is clear instead of a confusing XLSX-parse failure.
  const spreadsheetExt = /\.(xlsx|xls|xlsm|ods)$/i.test(file.name);
  const hasOtherKnownExt = /\.[a-z0-9]+$/i.test(file.name) && !spreadsheetExt;
  if (hasOtherKnownExt) {
    throw new Error('Unsupported file — use CSV or Excel');
  }

  // xlsx, xls, xlsm, ods — read as a spreadsheet. Only the first sheet: a
  // fleet or customer list is one sheet, and silently merging several would
  // import rows nobody chose.
  const base64 = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(base64, { type: 'base64', cellDates: false, raw: false });
  } catch {
    throw new Error("Couldn't read that file — try saving it as CSV or Excel");
  }
  const first = book.SheetNames[0];
  const sheet = first ? book.Sheets[first] : undefined;
  if (!sheet) throw new Error('That file has no sheets in it');
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t', blankrows: false });
  if (!csv.trim()) throw new Error('That sheet looks empty');
  return csv;
}
