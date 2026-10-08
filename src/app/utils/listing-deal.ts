/** Same rule as the listing page: the "Deal:" / "Listing type:" description tag, else the title. */
export function isSaleListing(apartment: { title?: string | null; description?: string | null }): boolean {
  const description = apartment.description || '';
  const deal = /(?:^|[|\r\n])\s*(?:Deal|Listing type):\s*([^|\r\n]+)/i.exec(description)?.[1]?.trim();
  if (deal) return /sale|buy|იყიდება|продаж/i.test(deal);
  return /for\s+sale|buy|იყიდება|продаж/i.test(apartment.title || '');
}
