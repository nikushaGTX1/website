/** Public contact details shown in the footer. */
export const SITE_CONTACT = {
  email: 'hello@velven.ge',
  // TODO: fill in Velven's real public phone number in international format, e.g. '+995 5XX XXX XXX'.
  // The footer hides the phone line while this is empty (it used to show the placeholder +995 555 123 456).
  phone: '',
};

/** "+995 568 444 220" -> "tel:+995568444220". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
