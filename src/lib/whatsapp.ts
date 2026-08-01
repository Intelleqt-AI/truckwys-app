import { Linking } from 'react-native';

// WhatsApp deep links. Ported from the web app's QuoteDetail so a number is
// normalised identically on both platforms.

/**
 * wa.me wants digits only, with a country code, no leading 0 or '+'. Customer
 * numbers are stored in whatever format staff typed them in (spaces, dashes, a
 * leading 0, sometimes already a country code) — normalise to South Africa's
 * code (this is a SA road-freight platform) when there's no country code
 * already on the number.
 */
export function toWhatsAppNumber(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) {
    digits = '27' + digits.slice(1);
  } else if (!digits.startsWith('27') && digits.length <= 10) {
    digits = '27' + digits;
  }
  return digits;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string {
  const number = toWhatsAppNumber(phone);
  const text = encodeURIComponent(message);
  // No number on file — still open WhatsApp so the user can pick a contact,
  // rather than failing.
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** Opens WhatsApp (or the browser fallback wa.me serves if it isn't installed). */
export async function openWhatsApp(phone: string | null | undefined, message: string): Promise<void> {
  await Linking.openURL(buildWhatsAppUrl(phone, message));
}
