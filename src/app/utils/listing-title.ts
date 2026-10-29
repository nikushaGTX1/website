import { AppLanguage } from '../services/translation.service';

export interface TitleDistrict {
  en: string;
  ka: string;
}

type PropertyType = 'apartment' | 'house' | 'commercial';

interface TitleParts {
  deal?: 'rent' | 'sale';
  type?: PropertyType;
  rooms?: number;
  bedrooms?: number;
  district?: TitleDistrict;
}

/** A listing, or the parts of it the title needs. */
export interface ListingTitleSource {
  title?: string | null;
  titleEn?: string | null;
  titleKa?: string | null;
  titleRu?: string | null;
  /** Used when the district in the title text cannot be read. */
  district?: string | null;
}

const GEORGIAN = /[Ⴀ-ჿ]/;

const DEAL_KA: Record<string, 'rent' | 'sale'> = {
  'ქირავდება': 'rent',
  'გაქირავდება': 'rent',
  'იყიდება': 'sale',
  'გაიყიდება': 'sale',
};

const TYPE_KA: Record<string, PropertyType> = {
  'ბინა': 'apartment',
  'სახლი': 'house',
  'კერძო სახლი': 'house',
  'კოტეჯი': 'house',
  'ვილა': 'house',
  'კომერციული ფართი': 'commercial',
};

const TYPE_WORDS: Record<string, PropertyType> = {
  apartment: 'apartment',
  apartament: 'apartment',
  flat: 'apartment',
  house: 'house',
  villa: 'house',
  cottage: 'house',
  'country house': 'house',
};

function findDistrict(text: string, districts: TitleDistrict[]): TitleDistrict | undefined {
  const value = text.trim().toLocaleLowerCase('en');
  if (!value) return undefined;
  const exact = districts.find(
    (d) => d.en.toLocaleLowerCase('en') === value || d.ka.toLocaleLowerCase('ka') === value,
  );
  if (exact) return exact;
  // Georgian district followed by a postposition (ზე, ში, ს ...).
  return [...districts]
    .filter((d) => GEORGIAN.test(d.ka))
    .sort((a, b) => b.ka.length - a.ka.length)
    .find((d) => value.startsWith(d.ka.toLocaleLowerCase('ka')) && value.length - d.ka.length <= 3);
}

/** "კრწანისი, თბილისში — $4,000/თვე" -> "კრწანისი"; "ვაკეში." -> "ვაკეში". */
function georgianPlace(text: string): string {
  return text
    .replace(/\s+—.*$/, '')
    .replace(/,\s*თბილის\S*$/, '')
    .replace(/[.\s]+$/, '')
    .trim();
}

function parseSentence(
  title: string,
  districts: TitleDistrict[],
  fallbackDistrict?: string | null,
): TitleParts | null {
  // "ქირავდება 3-ოთახიანი ბინა ვაკეში.", "ქირავდება 7 ოთახიანი კერძო სახლი დიღომი 1-9-ში",
  // "იყიდება 2 საძინებლიანი ბინა საბურთალოზე", "ქირავდება მყუდრო ბინა საბურთალოზე."
  const ka = title.match(
    /^(ქირავდება|გაქირავდება|იყიდება|გაიყიდება)\s+(?:(\d+)[-\s]ოთახიანი\s+|(\d+)\s+საძინებლიანი\s+)?(?:მყუდრო\s+|ახალი\s+|ლამაზი\s+)?(კერძო სახლი|კომერციული ფართი|ბინა|სახლი|კოტეჯი|ვილა)\s+(.+)$/,
  );
  if (ka) {
    return {
      deal: DEAL_KA[ka[1]],
      rooms: ka[2] ? Number(ka[2]) : undefined,
      bedrooms: ka[3] ? Number(ka[3]) : undefined,
      type: TYPE_KA[ka[4]],
      district: findDistrict(georgianPlace(ka[5]), districts)
        ?? (fallbackDistrict ? findDistrict(fallbackDistrict, districts) : undefined),
    };
  }

  const en = title.match(
    /^(?:(\d+)-bedroom\s+)?(apartment|house|villa|cottage|flat)\s+for\s+(rent|sale)\s+in\s+(.+)$/i,
  );
  if (en) {
    return {
      deal: en[3].toLowerCase() as 'rent' | 'sale',
      bedrooms: en[1] ? Number(en[1]) : undefined,
      type: TYPE_WORDS[en[2].toLowerCase()],
      district: findDistrict(en[4], districts),
    };
  }
  return null;
}

function renderSentence(parts: TitleParts, language: AppLanguage): string {
  const rent = parts.deal !== 'sale';
  const type = parts.type ?? 'apartment';
  const place = (d?: TitleDistrict) => (d ? (language === 'ka' ? d.ka : d.en) : '');

  if (language === 'ka') {
    const size = parts.rooms
      ? `${parts.rooms}-ოთახიანი `
      : parts.bedrooms ? `${parts.bedrooms} საძინებლიანი ` : '';
    const noun = type === 'house' ? 'სახლი' : type === 'commercial' ? 'კომერციული ფართი' : 'ბინა';
    const place_ = place(parts.district);
    return `${rent ? 'ქირავდება' : 'იყიდება'} ${size}${noun}${place_ ? ` ${place_}ში` : ''}`;
  }
  if (language === 'ru') {
    const noun = type === 'house' ? 'Дом' : type === 'commercial' ? 'Коммерческое помещение' : 'Квартира';
    const size = parts.rooms
      ? `, ${parts.rooms} комн.`
      : parts.bedrooms ? `, спален: ${parts.bedrooms}` : '';
    return `${noun}${size} ${rent ? 'в аренду' : 'на продажу'}${
      parts.district ? ` — ${parts.district.en}` : ''
    }`;
  }
  const size = parts.rooms
    ? `${parts.rooms}-room `
    : parts.bedrooms ? `${parts.bedrooms}-bedroom ` : '';
  const noun = type === 'commercial' ? 'commercial space' : type;
  return `${size}${noun} for ${rent ? 'rent' : 'sale'}${
    parts.district ? ` in ${parts.district.en}` : ''
  }`.replace(/^./, (char) => char.toUpperCase());
}

function localizeSegment(segment: string, language: AppLanguage, districts: TitleDistrict[]): string {
  const value = segment.trim();
  const lower = value.toLocaleLowerCase('en');

  if (/^for rent$/i.test(value) || value === 'ქირავდება') {
    return language === 'ka' ? 'ქირავდება' : language === 'ru' ? 'Аренда' : 'For Rent';
  }
  if (/^for sale$/i.test(value) || value === 'იყიდება') {
    return language === 'ka' ? 'იყიდება' : language === 'ru' ? 'Продажа' : 'For Sale';
  }

  const type = TYPE_WORDS[lower] ?? TYPE_KA[value];
  if (type) {
    if (language === 'ka') return type === 'house' ? 'სახლი' : type === 'commercial' ? 'კომერციული ფართი' : 'ბინა';
    if (language === 'ru') return type === 'house' ? 'Дом' : type === 'commercial' ? 'Коммерческое помещение' : 'Квартира';
    return type === 'house' ? 'House' : type === 'commercial' ? 'Commercial space' : 'Apartment';
  }

  const district = findDistrict(value, districts);
  if (district && (district.en.toLocaleLowerCase('en') === lower || district.ka === value)) {
    return language === 'ka' ? district.ka : district.en;
  }
  return value;
}

/**
 * The listing title in the visible site language:
 * 1. the saved translation for that language (titleEn / titleKa / titleRu),
 * 2. else the original title, re-written from its parts when it follows a known pattern,
 * 3. else the original title unchanged.
 */
export function localizeListingTitle(
  listing: string | ListingTitleSource | undefined | null,
  language: AppLanguage,
  districts: TitleDistrict[],
): string {
  const item: ListingTitleSource = typeof listing === 'string' ? { title: listing } : (listing ?? {});
  const saved = language === 'ka' ? item.titleKa : language === 'ru' ? item.titleRu : item.titleEn;
  if (saved?.trim()) return saved.trim();

  const source = item.title?.trim() ?? '';
  if (!source) return '';
  // A Georgian title is already right for Georgian readers: keep the owner's wording.
  if (language === 'ka' && GEORGIAN.test(source)) return source;

  const sentence = parseSentence(source, districts, item.district);
  if (sentence) return renderSentence(sentence, language);

  if (/\s[·|]\s/.test(source)) {
    return source
      .split(/\s+[·|]\s+/)
      .map((segment) => localizeSegment(segment, language, districts))
      .join(' · ');
  }
  return localizeSegment(source, language, districts);
}
