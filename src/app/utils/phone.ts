import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * A real phone number: Georgian by default ("555 12 34 56"), or any country when written
 * with a + prefix. Letters and short digit runs are rejected.
 */
export function isValidPhone(value: string | null | undefined): boolean {
  const text = (value || '').trim();
  if (!text || /[a-z]/i.test(text)) return false;
  return parsePhoneNumberFromString(text, 'GE')?.isValid() ?? false;
}

/** Digits for a wa.me link, with Georgia's +995 added to local numbers ("558 45 58 32"). */
export function whatsappDigits(value: string | null | undefined): string {
  const text = (value || '').trim();
  if (!text) return '';
  const parsed = parsePhoneNumberFromString(text, 'GE');
  return (parsed?.isValid() ? parsed.number : text).replace(/\D/g, '');
}
