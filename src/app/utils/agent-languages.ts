import { AppLanguage } from '../services/translation.service';

/**
 * Languages an agent can list. Same codes and order as the API
 * (AgentsController.SupportedLanguages); `short` is the label on agent cards.
 */
export const AGENT_LANGUAGES: Array<{ code: string; short: string; en: string; ka: string; ru: string }> = [
  { code: 'ka', short: 'Ge', en: 'Georgian', ka: 'ქართული', ru: 'Грузинский' },
  { code: 'en', short: 'En', en: 'English', ka: 'ინგლისური', ru: 'Английский' },
  { code: 'ru', short: 'Ru', en: 'Russian', ka: 'რუსული', ru: 'Русский' },
  { code: 'tr', short: 'Tr', en: 'Turkish', ka: 'თურქული', ru: 'Турецкий' },
  { code: 'hy', short: 'Hy', en: 'Armenian', ka: 'სომხური', ru: 'Армянский' },
  { code: 'az', short: 'Az', en: 'Azerbaijani', ka: 'აზერბაიჯანული', ru: 'Азербайджанский' },
  { code: 'uk', short: 'Ua', en: 'Ukrainian', ka: 'უკრაინული', ru: 'Украинский' },
  { code: 'de', short: 'De', en: 'German', ka: 'გერმანული', ru: 'Немецкий' },
  { code: 'fr', short: 'Fr', en: 'French', ka: 'ფრანგული', ru: 'Французский' },
  { code: 'es', short: 'Es', en: 'Spanish', ka: 'ესპანური', ru: 'Испанский' },
  { code: 'it', short: 'It', en: 'Italian', ka: 'იტალიური', ru: 'Итальянский' },
  { code: 'ar', short: 'Ar', en: 'Arabic', ka: 'არაბული', ru: 'Арабский' },
  { code: 'he', short: 'He', en: 'Hebrew', ka: 'ებრაული', ru: 'Иврит' },
  { code: 'zh', short: 'Zh', en: 'Chinese', ka: 'ჩინური', ru: 'Китайский' },
  { code: 'fa', short: 'Fa', en: 'Persian', ka: 'სპარსული', ru: 'Персидский' },
];

/** Shown when the API sends no languages (older responses). */
const DEFAULT_CODES = ['ka', 'en', 'ru'];

function known(codes: string[] | null | undefined): typeof AGENT_LANGUAGES {
  const list = codes?.length ? codes : DEFAULT_CODES;
  return AGENT_LANGUAGES.filter((language) => list.includes(language.code));
}

/** "Ge, En, Ru" for agent cards. */
export function languageShortList(codes: string[] | null | undefined): string {
  return known(codes).map((language) => language.short).join(', ');
}

/** "Georgian, English, Russian" in the visitor's language, for the profile page. */
export function languageNameList(codes: string[] | null | undefined, uiLanguage: AppLanguage): string {
  return known(codes).map((language) => language[uiLanguage]).join(', ');
}
