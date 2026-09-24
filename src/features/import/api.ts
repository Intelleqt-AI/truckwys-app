import { postData } from '@/lib/api/client';

export type ImportEntity = 'customers' | 'vehicles';

export interface ImportPreviewRow {
  row: number;
  data: Record<string, unknown>;
  problems: string[];
  notes?: string[];
  ready: boolean;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  total: number;
  ready: number;
  needs_attention: number;
  mapping: Record<string, string>;
  headers: string[] | null;
  unmapped_columns: string[];
}

export interface ImportCommitResult {
  imported: number;
  skipped: number;
  skipped_rows: ImportPreviewRow[];
  vehicle_types_created?: string[];
}

// Two calls, same shape the web uses: validate first so the preview can say
// "45 ready, 2 need attention" before anything is written, then commit the
// exact text that was validated. See core/views_import.py on the backend.
export const validateImport = (entity: ImportEntity, text: string) =>
  postData<ImportPreview>({ url: `import/${entity}/validate/`, data: { text } });

export const commitImport = (entity: ImportEntity, text: string) =>
  postData<ImportCommitResult>({ url: `import/${entity}/commit/`, data: { text } });
