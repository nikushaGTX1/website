import { getCountries } from 'libphonenumber-js/min';
import { COUNTRY_NAMES } from './country-names-data';

export interface CountryOption {
  code: string;
  /** English name: the stable value saved in the profile and shown to agents. */
  name: string;
  /** Country name in the current site language, used on screen. */
  label: string;
  /** Lower-cased English, Georgian, Russian and the code, so search works in any of them. */
  search: string;
  flag: string;
}

const cache = new Map<string, CountryOption[]>();

/** All countries with their names in the site's languages, cached per language. */
export function countryOptions(language = 'en'): CountryOption[] {
  const locale = language === 'ka' || language === 'ru' ? language : 'en';
  const cached = cache.get(locale);
  if (cached) return cached;
  const list = getCountries()
    .map((code) => {
      const names = COUNTRY_NAMES[code];
      const name = names?.en ?? code;
      return {
        code,
        name,
        label: names?.[locale] ?? name,
        search: fold([code, names?.en, names?.ka, names?.ru].filter(Boolean).join(' ')),
        flag: flagOf(code),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  cache.set(locale, list);
  return list;
}

/** The country name in the current site language, from the English name saved in the profile. */
export function localizedCountryName(englishName: string | null | undefined, language = 'en'): string {
  if (!englishName) return '';
  return countryOptions(language).find((country) => country.name === englishName)?.label ?? englishName;
}

/** Lower-case and drop Latin accents, so "turkiye" finds "Türkiye" and "sakartvelo" style typing is forgiving. */
export function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function flagOf(code: string): string {
  return String.fromCodePoint(...[...code].map((character) => 127397 + character.charCodeAt(0)));
}
