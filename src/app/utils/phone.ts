import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * A real Georgian phone number: "+995 555 12 34 56", "995555123456" or "555 12 34 56".
 * Velven only works with Georgian numbers; letters, short digit runs and other countries fail.
 */
export function isValidPhone(value: string | null | undefined): boolean {
  const text = (value || '').trim();
  if (!text || /[a-z]/i.test(text)) return false;
  const parsed = parsePhoneNumberFromString(text, 'GE');
  return !!parsed && parsed.isValid() && parsed.country === 'GE';
}

/** Digits for a wa.me link, with Georgia's +995 added to local numbers ("558 45 58 32"). */
export function whatsappDigits(value: string | null | undefined): string {
  const text = (value || '').trim();
  if (!text) return '';
  const parsed = parsePhoneNumberFromString(text, 'GE');
  return (parsed?.isValid() ? parsed.number : text).replace(/\D/g, '');
}
