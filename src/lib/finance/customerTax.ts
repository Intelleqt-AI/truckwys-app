import { registrationNumberProblem, vatNumberProblem } from './validation';

export interface CustomerTaxValues {
  vat_number: string;
  registration_number: string;
  country: string;
}

export const emptyCustomerTax = (): CustomerTaxValues => ({ vat_number: '', registration_number: '', country: 'ZA' });

export const customerTaxFrom = (c: {
  vat_number?: string | null;
  registration_number?: string | null;
  country?: string | null;
}): CustomerTaxValues => ({
  vat_number: c.vat_number || '',
  registration_number: c.registration_number || '',
  country: (c.country || 'ZA').toUpperCase(),
});

/** A problem that should stop a save (the server would reject it anyway). */
export const customerTaxProblem = (v: CustomerTaxValues) =>
  vatNumberProblem(v.vat_number, v.country) || registrationNumberProblem(v.registration_number, v.country);

/** The payload fields: VAT digits only; the registration number as typed (the server normalises it). */
export const customerTaxPayload = (v: CustomerTaxValues) => ({
  vat_number: v.vat_number.replace(/[\s-]/g, ''),
  registration_number: v.registration_number.trim(),
  country: v.country || 'ZA',
});
