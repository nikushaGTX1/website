import { AppLanguage } from '../services/translation.service';

export interface TitleDistrict {
  en: string;
  ka: string;
}

interface TitleParts {
  deal?: 'rent' | 'sale';
  type?: 'apartment' | 'house';
  bedrooms?: number;
  district?: TitleDistrict;
}

const GEORGIAN = /[Ⴀ-ჿ]/;

const DEAL_KA: Record<string, 'rent' | 'sale'> = {
  'ქირავდება': 'rent',
  'გაქირავდება': 'rent',
  'იყიდება': 'sale',
  'გაიყიდება': 'sale',
};

const TYPE_KA: Record<string, 'apartment' | 'house'> = {
  'ბინა': 'apartment',
  'სახლი': 'house',
  'კოტეჯი': 'house',
  'ვილა': 'house',
};

const TYPE_WORDS: Record<string, 'apartment' | 'house'> = {
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

function parseSentence(title: string, districts: TitleDistrict[]): TitleParts | null {
  const ka = title.match(
    /^(ქირავდება|გაქირავდება|იყიდება|გაიყიდება)\s+(?:(\d+)\s+საძინებლიანი\s+)?(ბინა|სახლი|კოტეჯი|ვილა)\s+(.+)$/,
  );
  if (ka) {
    return {
      deal: DEAL_KA[ka[1]],
      bedrooms: ka[2] ? Number(ka[2]) : undefined,
      type: TYPE_KA[ka[3]],
      district: findDistrict(ka[4], districts),
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
  const house = parts.type === 'house';
  const place = (d?: TitleDistrict) => (d ? (language === 'ka' ? d.ka : d.en) : '');

  if (language === 'ka') {
    const bedrooms = parts.bedrooms ? `${parts.bedrooms} საძინებლიანი ` : '';
    const place_ = place(parts.district);
    return `${rent ? 'ქირავდება' : 'იყიდება'} ${bedrooms}${house ? 'სახლი' : 'ბინა'}${place_ ? ` ${place_}ში` : ''}`;
  }
  if (language === 'ru') {
    return `${house ? 'Дом' : 'Квартира'} ${rent ? 'в аренду' : 'на продажу'}${
      parts.district ? ` — ${parts.district.en}` : ''
    }`;
  }
  const bedrooms = parts.bedrooms ? `${parts.bedrooms}-bedroom ` : '';
  return `${bedrooms}${house ? 'house' : 'apartment'} for ${rent ? 'rent' : 'sale'}${
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
    if (language === 'ka') return type === 'house' ? 'სახლი' : 'ბინა';
    if (language === 'ru') return type === 'house' ? 'Дом' : 'Квартира';
    return type === 'house' ? 'House' : 'Apartment';
  }

  const district = findDistrict(value, districts);
  if (district && (district.en.toLocaleLowerCase('en') === lower || district.ka === value)) {
    return language === 'ka' ? district.ka : district.en;
  }
  return value;
}

/** Re-renders a listing title in the visible site language. Unknown text is left untouched. */
export function localizeListingTitle(
  title: string | undefined | null,
  language: AppLanguage,
  districts: TitleDistrict[],
): string {
  const source = title?.trim() ?? '';
  if (!source) return '';

  const sentence = parseSentence(source, districts);
  if (sentence) return renderSentence(sentence, language);

  if (/\s[·|]\s/.test(source)) {
    return source
      .split(/\s+[·|]\s+/)
      .map((segment) => localizeSegment(segment, language, districts))
      .join(' · ');
  }
  return localizeSegment(source, language, districts);
}
