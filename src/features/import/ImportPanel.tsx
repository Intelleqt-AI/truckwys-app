import { useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { TextField, Button, Mono, Txt, ListRow, Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { useDemo } from '@/hooks/useDemo';
import { MONO_FONT, status as statusHues } from '@/theme/tokens';
import { validateImport, commitImport, type ImportEntity, type ImportPreview, type ImportCommitResult } from './api';
import { fileToText, type PickedFile } from './fileToText';

// Mirrors the web's SAMPLES/PREVIEW_FIELDS (PasteImportDrawer.tsx) — same
// copy, same recognised columns, same fields shown in the preview — so
// someone moving between the app and the web isn't relearning the feature.
const SAMPLES: Record<ImportEntity, { title: string; blurb: string; columns: string; example: string }> = {
  customers: {
    title: 'Import customers',
    blurb: 'Paste the rows straight out of Excel or Google Sheets, or drop the file in.',
    columns: 'Customer Name · Contact Person · Phone · Email · Address · Payment Terms',
    example:
      'Customer Name\tContact Person\tPhone\tEmail\tAddress\tPayment Terms\n' +
      'ABC Construction\tJohn Smith\t082 111 2222\tjohn@abc.co.za\tCape Town\t30 days',
  },
  vehicles: {
    title: 'Import vehicles',
    blurb: 'Paste your fleet list the same way, or drop an Excel or CSV file in.',
    columns: 'Registration · Vehicle Type · Make · Model · GVM · Capacity · Fuel · L/100km · Base Rate/km',
    example:
      'Registration\tVehicle Type\tMake\tModel\tGVM\tCapacity\tFuel\tL/100km\tBase Rate/km\n' +
      'CA 123456\tSuperlink\tScania\tR500\t56\t34\tDiesel\t38\tR32',
  },
};

const PREVIEW_FIELDS: Record<ImportEntity, string[]> = {
  customers: ['name', 'contact_person', 'phone', 'email', 'address'],
  vehicles: ['plate', 'type', 'make', 'capacity', 'base_rate'],
};

// Customer(s) / vehicle(s) — so a single imported row reads "Imported 1
// customer.", not "Imported 1 customers."
const NOUNS: Record<ImportEntity, { singular: string; plural: string }> = {
  customers: { singular: 'customer', plural: 'customers' },
  vehicles: { singular: 'vehicle', plural: 'vehicles' },
};

// Same formats the web's drop zone accepts (PasteImportDrawer's FILE_TYPES),
// plus the CSV/TSV MIME aliases real document providers actually report.
// `text/csv` alone greys out most real CSVs: Android's Downloads, Drive and
// several OEM file managers label a `.csv` as `text/comma-separated-values`
// (sometimes `application/csv` or `text/x-csv`), not `text/csv` — so the
// picker would let you *see* the file but not select it. Keep these even
// though they look redundant.
const DOC_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'text/x-comma-separated-values',
  'application/csv',
  'text/x-csv',
  'application/x-csv',
  'text/tab-separated-values',
  'text/tsv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  // Android only: some document providers report an unrecognised extension
  // (like .csv) as generic binary data rather than any text/* MIME type. On
  // iOS this maps to the `public.data` UTI, which would un-grey everything.
  ...(Platform.OS === 'android' ? ['application/octet-stream'] : []),
];

// A card list rather than a virtualized FlashList: it lives inside the
// host's own scroll view (VirtualizedLists can't nest inside one another),
// and a bulk import is realistically tens to a few hundred rows — nowhere
// near the backend's 2000-row cap — so a plain map stays responsive.
const DISPLAY_CAP = 500;

export interface ImportPanelParts {
  body: ReactNode;
  footer: ReactNode;
  /** True once "Check list" has returned a preview — lets a host swap its own
   *  heading/eyebrow instead of repeating the panel's own title. */
  hasPreview: boolean;
}

/**
 * The paste/pick/preview/commit flow shared by the standalone Import screen
 * (ImportScreen.tsx) and the onboarding wizard's import steps. Layout is left
 * to the host via a render-prop: ImportScreen puts `footer` in SheetScreen's
 * sticky footer slot, onboarding renders it inline under the step's card —
 * everything else about the flow (validation, commit, demo gating,
 * invalidation) lives here once instead of twice.
 */
export function ImportPanel({
  entity,
  onImported,
  blurb,
  children,
}: {
  entity: ImportEntity;
  /** Called only after a commit actually wrote rows — the host decides what
   *  happens next (alert + go back, or advance the wizard). */
  onImported?: (result: ImportCommitResult) => void;
  /** Overrides the default description above the paste box — the onboarding
   *  wizard uses this for its own step-specific copy ("you can always add
   *  them later instead"). Defaults to the standalone Import screen's text. */
  blurb?: string;
  children: (parts: ImportPanelParts) => ReactNode;
}) {
  const sample = SAMPLES[entity];
  const blurbText = blurb ?? sample.blurb;
  const qc = useQueryClient();
  const demo = useDemo();
  const { colors } = useTheme();

  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');

  const pickFile = async () => {
    if (demo.block()) return;
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: DOC_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      toast.error("Couldn't open the file picker");
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const file: PickedFile = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType };
    setBusy(true);
    try {
      const asText = await fileToText(file);
      if (!asText.trim()) throw new Error('That file looks empty');
      setText(asText);
      setFileName(file.name);
      // Silent by app convention (see lib/toast.tsx) — still fires the
      // success haptic.
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file — try saving it as CSV or Excel");
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    if (!text.trim()) {
      toast.error('Paste your list first');
      return;
    }
    setBusy(true);
    try {
      const res = await validateImport(entity, text);
      setPreview(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read that list');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (demo.block()) return;
    setBusy(true);
    try {
      const res = await commitImport(entity, text);
      if (res.imported > 0) {
        invalidateFor(qc, entity === 'customers' ? 'customer' : 'vehicle');
        onImported?.(res);
      } else {
        toast.error('Nothing was imported — every row needs attention');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <View>
      {!preview ? (
        <View className="gap-3">
          <Txt className="text-callout text-muted">{blurbText}</Txt>

          {/* A file is just another way to fill the paste box: it's
              converted to the same tab-separated text a paste would
              produce, so both go through one validation and preview. */}
          <ListRow
            leading={<Icon name="import" size={20} color={colors.muted} />}
            title={fileName ? `Loaded ${fileName}` : 'Drop an Excel or CSV file'}
            subtitle={fileName ? 'Check it below, or pick another file' : 'xlsx · xls · ods · csv'}
            onPress={pickFile}
            last
          />

          <View>
            <Mono className="mb-1.5 text-micro uppercase tracking-wide text-faint">
              {fileName ? 'From your file' : 'Paste here'}
            </Mono>
            <TextField
              value={text}
              onChangeText={setText}
              placeholder={sample.example}
              placeholderTextColor={colors.faint}
              multiline
              numberOfLines={10}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ minHeight: 220, fontFamily: MONO_FONT, fontSize: 12, textAlignVertical: 'top' }}
            />
          </View>

          <Txt className="text-caption text-faint">
            Include the heading row if you have one — we work out which column is which.{'\n'}
            Columns we recognise: {sample.columns}
          </Txt>
        </View>
      ) : (
        <View>
          <View className="mb-3 flex-row flex-wrap items-center gap-2">
            <Mono className="text-micro text-faint">{preview.total} found</Mono>
            <Mono className="text-micro text-faint">·</Mono>
            <Mono className="text-micro" style={{ color: preview.ready ? statusHues.success : colors.faint }}>
              {preview.ready} ready
            </Mono>
            {preview.needs_attention > 0 && (
              <>
                <Mono className="text-micro text-faint">·</Mono>
                <Mono className="text-micro text-warning">{preview.needs_attention} need attention</Mono>
              </>
            )}
          </View>

          {preview.needs_attention > 0 && (
            <Txt className="mb-3 text-caption text-faint">
              Rows needing attention are skipped — the other {preview.ready} still import. Fix them in your
              spreadsheet and paste again.
            </Txt>
          )}

          {/* Not nested inside the needs_attention block above — an ignored
              column is worth knowing about even when every row that's left is
              otherwise ready. */}
          {preview.unmapped_columns?.length > 0 && (
            <Txt className="mb-3 text-caption text-faint">
              These columns were ignored because there&apos;s nowhere to put them:{' '}
              {preview.unmapped_columns.join(', ')}.
            </Txt>
          )}

          {preview.rows.slice(0, DISPLAY_CAP).map((r) => {
            const fields = PREVIEW_FIELDS[entity];
            // Non-null: both PREVIEW_FIELDS lists above are fixed, non-empty.
            const title = String(r.data?.[fields[0]!] ?? '') || `Row ${r.row}`;
            const subtitle = fields
              .slice(1)
              .map((f) => String(r.data?.[f] ?? ''))
              .filter(Boolean)
              .join(' · ');
            const statusText = r.problems.length ? r.problems.join('; ') : r.notes?.join('; ') || 'Ready';
            return (
              <View
                key={r.row}
                className={`mb-2 overflow-hidden rounded-card border ${
                  r.ready ? 'border-line bg-surface' : 'border-warning bg-warning-bg'
                }`}
              >
                <ListRow
                  title={title}
                  subtitle={subtitle || undefined}
                  trailing={
                    <Mono
                      className={`text-micro ${r.problems.length ? 'text-warning' : 'text-faint'}`}
                      numberOfLines={2}
                      style={{ maxWidth: 140, textAlign: 'right' }}
                    >
                      {statusText}
                    </Mono>
                  }
                  last
                />
              </View>
            );
          })}
          {preview.rows.length > DISPLAY_CAP && (
            <Txt className="text-center text-caption text-faint">
              Showing the first {DISPLAY_CAP} of {preview.rows.length} rows — all of them still import.
            </Txt>
          )}
        </View>
      )}
    </View>
  );

  const footer = preview ? (
    <View className="flex-row gap-2.5">
      <View className="flex-1">
        <Button
          label={`Import ${preview.ready}`}
          loading={busy}
          disabled={preview.ready === 0}
          onPress={commit}
          fullWidth
        />
      </View>
      <Button label="Change list" variant="secondary" disabled={busy} onPress={() => setPreview(null)} />
    </View>
  ) : (
    <Button label="Check list" loading={busy} disabled={!text.trim()} onPress={check} fullWidth />
  );

  return <>{children({ body, footer, hasPreview: !!preview })}</>;
}

// Re-exported so a host can build its own "Imported N …" copy without
// re-deriving the entity's noun.
export { NOUNS as importNouns };
