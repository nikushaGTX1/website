import { AppLanguage } from '../services/translation.service';

/**
 * Copy for the client review pages in all three site languages. These pages build
 * sentences around names and numbers, which the page-wide dictionary translator
 * cannot match, so they render their own text and opt out with data-no-translate.
 */
export function pick(language: AppLanguage, en: string, ka: string, ru: string): string {
  return language === 'ka' ? ka : language === 'ru' ? ru : en;
}

/** Russian noun form for a count: 1 отзыв, 2 отзыва, 5 отзывов. */
export function ruPlural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const RATING_LABELS: Record<AppLanguage, string[]> = {
  en: ['', 'Very Bad', 'Bad', 'Average', 'Good', 'Excellent'],
  ka: ['', 'ძალიან ცუდი', 'ცუდი', 'საშუალო', 'კარგი', 'შესანიშნავი'],
  ru: ['', 'Очень плохо', 'Плохо', 'Средне', 'Хорошо', 'Отлично'],
};

export function ratingLabel(language: AppLanguage, rating: number): string {
  return RATING_LABELS[language][rating] ?? '';
}

/** "4 Stars" / "4 ვარსკვლავი" / "4 звезды". */
export function starsText(language: AppLanguage, count: number): string {
  return pick(
    language,
    `${count} ${count === 1 ? 'Star' : 'Stars'}`,
    `${count} ვარსკვლავი`,
    `${count} ${ruPlural(count, 'звезда', 'звезды', 'звёзд')}`,
  );
}

/** "7 reviews" / "7 შეფასება" / "7 отзывов". */
export function reviewsText(language: AppLanguage, count: number): string {
  return pick(
    language,
    `${count} ${count === 1 ? 'review' : 'reviews'}`,
    `${count} შეფასება`,
    `${count} ${ruPlural(count, 'отзыв', 'отзыва', 'отзывов')}`,
  );
}

const LOCALES: Record<AppLanguage, string> = { en: 'en-US', ka: 'ka-GE', ru: 'ru-RU' };

export function formatReviewDate(
  language: AppLanguage,
  iso: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // Many browsers ship no Georgian date data and silently fall back to English.
  if (language === 'ka') {
    const months = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
    const parts = [options.day ? String(date.getDate()) : '', options.month ? months[date.getMonth()] : '', options.year ? String(date.getFullYear()) : '']
      .filter(Boolean)
      .join(' ');
    if (!options.hour) return parts;
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return `${parts}, ${time}`;
  }
  try {
    return new Intl.DateTimeFormat(LOCALES[language], options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}

/**
 * The API answers in English; show its known messages in the visitor's language.
 * Unknown messages fall back to a generic line instead of mixing languages.
 */
export function reviewSubmitError(language: AppLanguage, status: number, message?: string): string {
  const text = message || '';
  if (status === 0) {
    return pick(language,
      'No connection. Check your internet and try again.',
      'კავშირი არ არის. შეამოწმეთ ინტერნეტი და სცადეთ ხელახლა.',
      'Нет подключения. Проверьте интернет и попробуйте снова.');
  }
  if (/already reviewed/i.test(text)) {
    return pick(language,
      'You have already reviewed this agent today. Thank you!',
      'დღეს ამ აგენტს უკვე შეაფასეთ. გმადლობთ!',
      'Вы уже оценили этого агента сегодня. Спасибо!');
  }
  if (status === 429) {
    return pick(language,
      'Too many reviews from this connection. Please try again later.',
      'ამ კავშირიდან ძალიან ბევრი შეფასება გაიგზავნა. სცადეთ მოგვიანებით.',
      'Слишком много отзывов с этого подключения. Попробуйте позже.');
  }
  if (/remove links/i.test(text)) {
    return pick(language,
      'Please remove links from your review.',
      'გთხოვთ, წაშალოთ ბმულები შეფასებიდან.',
      'Пожалуйста, уберите ссылки из отзыва.');
  }
  if (/take a moment/i.test(text)) {
    return pick(language,
      'Please take a moment to review before submitting.',
      'გთხოვთ, გაგზავნამდე ცოტა დრო დაუთმოთ შეფასებას.',
      'Пожалуйста, не торопитесь с отправкой.');
  }
  if (/review yourself/i.test(text)) {
    return pick(language,
      'You cannot review yourself.',
      'საკუთარი თავის შეფასება შეუძლებელია.',
      'Нельзя оценить самого себя.');
  }
  if (/^Name can be/i.test(text)) {
    return pick(language,
      'Name can be at most 60 characters.',
      'სახელი მაქსიმუმ 60 სიმბოლოსგან უნდა შედგებოდეს.',
      'Имя может содержать не более 60 символов.');
  }
  if (/^Comment can be/i.test(text)) {
    return pick(language,
      'Comment can be at most 1000 characters.',
      'კომენტარი მაქსიმუმ 1000 სიმბოლოსგან უნდა შედგებოდეს.',
      'Комментарий может содержать не более 1000 символов.');
  }
  if (/rating from 1 to 5/i.test(text)) {
    return pick(language,
      'Choose a rating from 1 to 5 stars.',
      'აირჩიეთ შეფასება 1-დან 5 ვარსკვლავამდე.',
      'Выберите оценку от 1 до 5 звёзд.');
  }
  if (/reload the page/i.test(text)) {
    return pick(language,
      'Reload the page and try again.',
      'განაახლეთ გვერდი და სცადეთ ხელახლა.',
      'Обновите страницу и попробуйте снова.');
  }
  return pick(language,
    'Your review could not be sent. Please try again.',
    'შეფასების გაგზავნა ვერ მოხერხდა. სცადეთ ხელახლა.',
    'Не удалось отправить отзыв. Попробуйте снова.');
}
