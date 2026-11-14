import { Apartment } from '../models/apartment';

/**
 * Parking cost is stored as listing metadata lines in the description:
 *   "Parking cost: Free" | "Parking cost: Paid"
 *   "Parking price: 100 USD" (or "GEL"), only when the price is known.
 */
function metadata(description: string, label: string): string {
  return description.match(new RegExp(`(?:^|[|\\r\\n])\\s*${label}:\\s*([^|\\r\\n]+)`, 'i'))?.[1]?.trim() || '';
}

export function parseParkingCost(description = ''): {
  cost: '' | 'Free' | 'Paid';
  price: number | null;
  currency: 'USD' | 'GEL';
} {
  const costText = metadata(description, 'Parking cost').toLowerCase();
  const priceMatch = /([\d.,]+)\s*(USD|GEL)?/i.exec(metadata(description, 'Parking price'));
  const price = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : NaN;
  return {
    cost: costText === 'free' ? 'Free' : costText === 'paid' || Number.isFinite(price) ? 'Paid' : '',
    price: Number.isFinite(price) && price > 0 ? price : null,
    currency: priceMatch?.[2]?.toUpperCase() === 'GEL' ? 'GEL' : 'USD',
  };
}

const BUILDING_PARKING = ['PrivateCourtyard', 'CourtyardWithBarrier'];
const BUILDING_PARKING_LABELS = ['private courtyard parking', 'courtyard with a barrier/gate'];

/**
 * Text shown instead of a plain "Yes" for parking:
 *   price known   -> "Extra $100"      (Georgian: "ემატება $100")
 *   paid, unknown -> "Paid"            (Georgian: "ფასიანია")
 *   free          -> "Free"
 *   gated/private courtyard -> "Building parking" (Georgian: "კორპუსის პარკინგი")
 * '' when nothing more specific than "Yes" is known.
 */
export function parkingCostLabel(
  apartment: Pick<Apartment, 'description' | 'parkingCondition'> | null | undefined,
): string {
  const description = apartment?.description || '';
  const { cost, price, currency } = parseParkingCost(description);
  if (cost === 'Paid') {
    return price == null ? 'Paid' : `Extra ${currency === 'GEL' ? '₾' : '$'}${price.toLocaleString('en-US')}`;
  }
  if (cost === 'Free') return 'Free';
  const type = (apartment?.parkingCondition || '').trim();
  const typeLabel = metadata(description, 'Parking type').toLowerCase();
  if (BUILDING_PARKING.includes(type) || BUILDING_PARKING_LABELS.includes(typeLabel)) return 'Building parking';
  return '';
}

const PARKING_TYPES: Record<string, string> = {
  Garage: 'Garage',
  PrivateCourtyard: 'Private courtyard parking',
  CourtyardWithBarrier: 'Courtyard with a barrier/gate',
  CourtyardWithoutBarrier: 'Courtyard without a barrier/gate',
  StreetParking: 'Street parking',
  DifficultParking: 'Parking is difficult',
};

/** Kind of parking ("Garage", "Street parking"...), from the field or the "Parking type:" line. '' when unknown. */
export function parkingTypeLabel(apartment: Pick<Apartment, 'description' | 'parkingCondition'> | null | undefined): string {
  const type = (apartment?.parkingCondition || '').trim();
  if (PARKING_TYPES[type]) return PARKING_TYPES[type];
  const label = metadata(apartment?.description || '', 'Parking type').toLowerCase();
  return Object.values(PARKING_TYPES).find((value) => value.toLowerCase() === label) || '';
}
