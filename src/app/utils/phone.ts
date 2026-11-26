import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * A phone number from any country. Georgian numbers can be typed without the code
 * ("555 12 34 56"); others need their + country code ("+34 633 22 73 49").
 * Accepted when the number is valid, or at least plausible (7-15 digits after the +), so
 * foreign numbers whose exact format the library does not know are not refused.
 */
export function isValidPhone(value: string | null | undefined): boolean {
  const text = (value || '').trim();
  if (!text || /[a-z]/i.test(text)) return false;
  const parsed = parsePhoneNumberFromString(text, 'GE');
  if (parsed?.isValid()) return true;
  // Foreign numbers (with +): accept when plausible, even if the library does not know the format.
  if (!text.startsWith('+')) return false;
  const digits = text.replace(/D/g, '');
  return !!parsed?.isPossible() || (digits.length >= 7 && digits.length <= 15);
}

/** Same rule as isValidPhone (kept for fields that were already international). */
export function isValidAnyPhone(value: string | null | undefined): boolean {
  return isValidPhone(value);
}

/** Digits for a wa.me link, with Georgia's +995 added to local numbers ("558 45 58 32"). */
export function whatsappDigits(value: string | null | undefined): string {
  const text = (value || '').trim();
  if (!text) return '';
  const parsed = parsePhoneNumberFromString(text, 'GE');
  return (parsed?.isValid() ? parsed.number : text).replace(/\D/g, '');
}
