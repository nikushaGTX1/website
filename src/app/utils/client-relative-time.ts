import { AppLanguage } from '../services/translation.service';

/** Chromium may fall back to English for Georgian relative dates. */
export function clientRelativeTime(value: string, language: AppLanguage, now = Date.now()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const seconds = (date.getTime() - now) / 1000;
  if (language === 'ka') {
    for (const [size, unit] of [[31536000,'წლის'],[2592000,'თვის'],[604800,'კვირის'],[86400,'დღის'],[3600,'საათის'],[60,'წუთის']] as const) {
      if (Math.abs(seconds) >= size) {
        const count = Math.round(Math.abs(seconds) / size);
        return seconds < 0 ? `${count} ${unit} წინ` : `${count} ${unit} შემდეგ`;
      }
    }
    return 'ახლახან';
  }
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  for (const [unit, size] of [['year',31536000],['month',2592000],['week',604800],['day',86400],['hour',3600],['minute',60]] as const)
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return format.format(0, 'minute');
}
