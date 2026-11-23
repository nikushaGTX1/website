/** Velven Match "type of home" answer: a flat in a building or a private house. */
export type HomeType = 'Apartment' | 'House' | 'Commercial';

/**
 * What kind of property a listing is, read from its "Type: Private house | Deal: ..." meta
 * (set by the upload form), else from the title. Null when nothing says.
 * Country houses, cottages and villas count as houses; plots, commercial places and
 * hotels are 'Other' and never match either answer.
 */
export function listingHomeType(apartment: { title?: string | null; description?: string | null }): HomeType | 'Other' | null {
  const type = (apartment.description || '')
    .split(/[|\r\n]/)
    .map((part) => part.trim())
    .find((part) => /^type:/i.test(part))
    ?.slice(5)
    .trim()
    .toLowerCase();
  const text = type || (apartment.title || '').toLowerCase();
  if (!text) return null;
  // Shops and offices match buyers who want commercial space; plots and hotels never match.
  if (/commercial|office|shop|store|კომერციულ|ფართი|коммерч/.test(text)) return 'Commercial';
  if (/plot|land|hotel|მიწ|სასტუმრო|участ|гостиниц/.test(text)) return 'Other';
  if (/house|cottage|villa|სახლი|აგარაკი|дом|коттедж/.test(text)) return 'House';
  if (/apartment|apartament|flat|ბინა|квартир/.test(text)) return 'Apartment';
  return type ? 'Other' : null;
}

/**
 * Types of home the client accepts. One or both can be chosen; profiles saved with the
 * single-choice version keep their answer, and older searches without one meant Apartment.
 */
export function wantedHomeTypes(profile: { homeType?: HomeType | ''; homeTypes?: HomeType[] }): HomeType[] {
  if (profile.homeTypes?.length) return profile.homeTypes;
  return [profile.homeType || 'Apartment'];
}
