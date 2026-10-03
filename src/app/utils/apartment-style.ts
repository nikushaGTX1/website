/** Apartment style used by uploads and Velven Match: Modern, Vintage or Other ("Something else"). */
export type ApartmentStyle = 'Modern' | 'Vintage' | 'Other';

/** Maps older values (Luxury, Minimal, Industrial, Classic…) onto the three current styles. */
export function normalizeApartmentStyle(value: string | null | undefined): ApartmentStyle | '' {
  const style = (value || '').trim().toLowerCase();
  if (!style) return '';
  if (['modern', 'luxury', 'minimal', 'industrial', 'contemporary'].includes(style)) return 'Modern';
  if (['vintage', 'classic', 'old', 'retro'].includes(style)) return 'Vintage';
  return 'Other';
}
