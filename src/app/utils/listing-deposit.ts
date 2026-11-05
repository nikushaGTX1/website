import { Apartment } from '../models/apartment';

/** Refundable deposit from the listing description ("Deposit: 1200"), 0 when none. */
export function listingDeposit(apartment: Pick<Apartment, 'description'> | null | undefined): number {
  const match = (apartment?.description || '').match(/(?:^|[|\n])\s*Deposit:\s*([\d.]+)/i);
  return match ? Number(match[1]) || 0 : 0;
}

/** The owner entered prices in GEL, so the deposit amount is in GEL too. */
export function listingDepositInGel(apartment: Pick<Apartment, 'description'> | null | undefined): boolean {
  return /(?:^|[|\n])\s*Currency:\s*GEL/i.test(apartment?.description || '');
}
