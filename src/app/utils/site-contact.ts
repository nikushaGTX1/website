/** Public contact details shown in the footer. */
export const SITE_CONTACT = {
  email: 'info@velven.ge',
  // Public phone number (footer, contact). The footer hides the phone line when this is empty.
  phone: '+995 558 47 48 89',
};

/** "+995 568 444 220" -> "tel:+995568444220". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
