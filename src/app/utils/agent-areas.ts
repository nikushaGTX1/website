import type { Apartment } from '../models/apartment';

/** Georgian district names -> the English names used on the agents page. */
const KA_DISTRICTS: Record<string, string> = {
  'ვაკე': 'Vake',
  'საბურთალო': 'Saburtalo',
  'ვერა': 'Vera',
  'მთაწმინდა': 'Mtatsminda',
  'სოლოლაკი': 'Sololaki',
  'ძველი თბილისი': 'Old Tbilisi',
  'დიდუბე': 'Didube',
  'ჩუღურეთი': 'Chughureti',
  'ნაძალადევი': 'Nadzaladevi',
  'ისანი': 'Isani',
  'სამგორი': 'Samgori',
  'გლდანი': 'Gldani',
  'კრწანისი': 'Krtsanisi',
  'დიდი დიღომი': 'Didi Dighomi',
  'დიღომი': 'Dighomi',
  'ორთაჭალა': 'Ortachala',
  'ბაგები': 'Bagebi',
  'ლისი': 'Lisi',
  'ვაშლიჯვარი': 'Vashlijvari',
  'ავლაბარი': 'Avlabari',
};

/** "Didi Digomi", "didi dighomi" and "დიდი დიღომი" all give "didi dighomi". */
export function districtKey(value: string | null | undefined): string {
  let raw = (value || '').trim();
  if (!raw) return '';
  const georgian = Object.keys(KA_DISTRICTS).find((name) => raw.startsWith(name));
  if (georgian) raw = KA_DISTRICTS[georgian];
  return raw
    .toLowerCase()
    .replace(/digomi/g, 'dighomi')
    .replace(/chugureti/g, 'chughureti')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Display name for a district key ("didi dighomi" -> "Didi Dighomi"). */
export function districtLabel(key: string): string {
  return key.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The listing belongs to this agent (the account that uploaded it). */
function listedBy(apartment: Apartment, agentIds: string[]): boolean {
  const owner = (apartment as Apartment & { uploadedByUserId?: string | null }).uploadedByUserId
    || apartment.agentUserId || apartment.agentId || '';
  return !!owner && agentIds.includes(String(owner));
}

/**
 * The districts an agent really works in: those of their published listings, most listings
 * first. Used for the agents page filter, the card location and "Areas of expertise".
 */
export function agentDistricts(apartments: Apartment[], agentIds: Array<string | undefined | null>): string[] {
  const ids = agentIds.filter((id): id is string => !!id).map(String);
  const counts = new Map<string, number>();
  for (const apartment of apartments) {
    if (!listedBy(apartment, ids)) continue;
    const key = districtKey(apartment.district);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => districtLabel(key));
}

const KA_TO_LATIN: Record<string, string> = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i', კ: 'k', ლ: 'l', მ: 'm',
  ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh', რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh',
  ყ: 'k', შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz', წ: 'ts', ჭ: 'ch', ხ: 'kh', ჯ: 'j', ჰ: 'h',
};

/**
 * Name text in one comparable Latin form: "გიორგი ლომიძე" and "Giorgi Lomidze" both give
 * "giorgi lomidze", so a search works in either alphabet.
 */
export function searchKey(value: string | null | undefined): string {
  return Array.from((value || '').toLowerCase())
    .map((char) => KA_TO_LATIN[char] ?? char)
    .join('')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * WhatsApp chat link: WhatsApp Web on a computer (the "whatsapp://" app link opened by wa.me
 * does nothing when the desktop app is not installed), wa.me on phones.
 */
export function whatsappChatUrl(digits: string): string {
  const desktop = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  return desktop ? `https://web.whatsapp.com/send?phone=${digits}` : `https://wa.me/${digits}`;
}
