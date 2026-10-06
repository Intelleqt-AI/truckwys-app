/**
 * Client-side format hints for SA tax identifiers. The server validates and
 * normalises; these only tell the user early, in words, what it expects.
 */

/** SA VAT number: 10 digits starting with 4. Spaces and dashes are ignored. */
export function vatNumberProblem(value: string, country = 'ZA'): string | null {
  const v = value.replace(/[\s-]/g, '');
  if (!v) return null;
  if (country.toUpperCase() !== 'ZA') return null;
  if (!/^\d+$/.test(v)) return 'A South African VAT number is digits only.';
  if (v.length !== 10) return `A South African VAT number has 10 digits (this has ${v.length}).`;
  if (!v.startsWith('4')) return 'A South African VAT number starts with 4.';
  return null;
}

/** CIPC registration number: YYYY/NNNNNN/NN. Accepts spaces, dashes or no separators. */
export function registrationNumberProblem(value: string, country = 'ZA'): string | null {
  const v = value.trim();
  if (!v || country.toUpperCase() !== 'ZA') return null;
  const digits = v.replace(/[\s/-]/g, '');
  if (!/^\d{12}$/.test(digits)) return 'CIPC numbers look like 2015/123456/07 (year, six digits, two digits).';
  const year = parseInt(digits.slice(0, 4), 10);
  if (year < 1800 || year > new Date().getFullYear()) {
    return 'The first part of a CIPC number is the year of registration.';
  }
  return null;
}

/** "201512345607" -> "2015/123456/07" (what the server stores). */
export function normaliseRegistrationNumber(value: string): string {
  const digits = value.replace(/[\s/-]/g, '');
  return /^\d{12}$/.test(digits) ? `${digits.slice(0, 4)}/${digits.slice(4, 10)}/${digits.slice(10)}` : value.trim();
}

/** A short list of the countries TruckWys customers trade with; the field takes any ISO-2 code. */
export const COUNTRIES = [
  { code: 'ZA', label: 'South Africa' },
  { code: 'NA', label: 'Namibia' },
  { code: 'BW', label: 'Botswana' },
  { code: 'ZW', label: 'Zimbabwe' },
  { code: 'MZ', label: 'Mozambique' },
  { code: 'LS', label: 'Lesotho' },
  { code: 'SZ', label: 'Eswatini' },
  { code: 'ZM', label: 'Zambia' },
  { code: 'MW', label: 'Malawi' },
  { code: 'CD', label: 'DR Congo' },
  { code: 'TZ', label: 'Tanzania' },
];

export const countryLabel = (code?: string | null) =>
  COUNTRIES.find((c) => c.code === (code || '').toUpperCase())?.label ?? (code || '—');
