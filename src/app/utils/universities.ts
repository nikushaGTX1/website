import { Apartment } from '../models/apartment';

/**
 * The only universities shown as "Nearest university". Google's `university` type also
 * covers training centres and colleges (e.g. Educational Center "Queen"), so a place
 * counts only when its name matches one of these. Names come back from Google in
 * Georgian or English, so both spellings are listed. `acronyms` match whole words only.
 */
const UNIVERSITIES: Array<{ names: string[]; acronyms?: string[] }> = [
  // State universities
  { names: ['ჯავახიშვილის', 'javakhishvili', 'tbilisi state university', 'თბილისის სახელმწიფო უნივერსიტეტი'], acronyms: ['tsu', 'თსუ'] },
  { names: ['ილიას სახელმწიფო', 'ilia state', 'ilia university', 'ილიაუნი'], acronyms: ['iliauni'] },
  { names: ['ტექნიკური უნივერსიტეტი', 'technical university'], acronyms: ['gtu', 'სტუ'] },
  { names: ['სახელმწიფო სამედიცინო უნივერსიტეტი', 'state medical university'], acronyms: ['tsmu', 'თსსუ'] },
  { names: ['სოხუმის სახელმწიფო', 'sokhumi state'] },
  { names: ['თეატრისა და კინოს', 'theatre and film', 'theater and film'] },
  // Private universities
  { names: ['თავისუფალი უნივერსიტეტი', 'free university'], acronyms: ['freeuni'] },
  { names: ['აგრარული უნივერსიტეტი', 'agricultural university'], acronyms: ['agruni'] },
  { names: ['კავკასიის უნივერსიტეტი', 'caucasus university'] },
  { names: ['საქართველოს უნივერსიტეტი', 'university of georgia'] },
  { names: ['ბიზნესისა და ტექნოლოგიების', 'business and technology university'], acronyms: ['btu'] },
  { names: ['საქართველოს ეროვნული უნივერსიტეტი', 'georgian national university'], acronyms: ['seu'] },
  { names: ['შავი ზღვის საერთაშორისო', 'black sea university'], acronyms: ['ibsu'] },
  { names: ['საზოგადოებრივ საქმეთა', 'institute of public affairs'], acronyms: ['gipa'] },
  { names: ['ქართულ ამერიკული', 'georgian american university'], acronyms: ['gau'] },
  { names: ['კავკასიის საერთაშორისო', 'caucasus international university'], acronyms: ['ciu'] },
  { names: ['ალტე', 'alte university'] },
  { names: ['ევროპის უნივერსიტეტი', 'european university'] },
  { names: ['რობაქიძის', 'robakidze'] },
  { names: ['ტვილდიანის', 'tvildiani'] },
  { names: ['ნიუ ვიჟენ', 'new vision university'], acronyms: ['nvu'] },
  { names: ['აღმოსავლეთ ევროპის', 'east european university'], acronyms: ['eeu'] },
  { names: ['ორბელიანის', 'orbeliani'], acronyms: ['sabauni', 'საბაუნი'] },
  { names: ['საავიაციო უნივერსიტეტი', 'aviation university'] },
  { names: ['ანდრია პირველწოდებულის', 'st andrew the first called', 'saint andrew the first called'], acronyms: ['sangu'] },
  { names: ['დავით აღმაშენებლის სახელობის უნივერსიტეტი', 'david aghmashenebeli university'], acronyms: ['სდასუ'] },
  { names: ['გეომედი', 'geomedi'] },
  { names: ['ბრიტანული უნივერსიტეტი', 'british university'] },
  { names: ['ალტერბრიჯი', 'alterbridge'] },
  { names: ['საქართველოს საერთაშორისო უნივერსიტეტი', 'international university of georgia', 'georgian international university'], acronyms: ['ჯიუ', 'giu'] },
];

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[-–—_'"`’‘“”„«».,()]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const ENTRIES = UNIVERSITIES.map((entry) => ({
  names: entry.names.map(normalize),
  acronyms: new Set((entry.acronyms || []).map(normalize)),
}));

/** True when a Google place name is one of the listed Tbilisi universities. */
export function isListedUniversity(name: string | null | undefined): boolean {
  if (!name) return false;
  const text = normalize(name);
  const words = new Set(text.split(' '));
  return ENTRIES.some(
    (entry) =>
      entry.names.some((needle) => text.includes(needle)) ||
      [...entry.acronyms].some((acronym) => words.has(acronym)),
  );
}

/**
 * Walking minutes to the nearest university, only when the saved place is a listed one.
 * Listings measured before the list existed may hold a training centre; those are ignored.
 */
export function listedUniversityMinutes(
  apartment: Pick<Apartment, 'universityDistanceMinutes' | 'nearbyPlaceNames'>,
): number | undefined {
  if (apartment.universityDistanceMinutes == null) return undefined;
  try {
    const names = JSON.parse(apartment.nearbyPlaceNames || 'null');
    return isListedUniversity(names?.universityDistanceMinutes) ? apartment.universityDistanceMinutes : undefined;
  } catch {
    return undefined;
  }
}

/** Universities a student can pick in Velven Match (Tbilisi), in English and Georgian. */
export interface UniversityChoice {
  id: string;
  en: string;
  ka: string;
  ru: string;
}

export const UNIVERSITY_CHOICES: UniversityChoice[] = [
  { id: 'tsu', en: 'Ivane Javakhishvili Tbilisi State University (TSU)', ka: 'ივანე ჯავახიშვილის სახელობის თბილისის სახელმწიფო უნივერსიტეტი (თსუ)', ru: 'Тбилисский государственный университет им. Ив. Джавахишвили (ТГУ)' },
  { id: 'iliauni', en: 'Ilia State University', ka: 'ილიას სახელმწიფო უნივერსიტეტი', ru: 'Государственный университет Ильи' },
  { id: 'gtu', en: 'Georgian Technical University (GTU)', ka: 'საქართველოს ტექნიკური უნივერსიტეტი (სტუ)', ru: 'Грузинский технический университет (ГТУ)' },
  { id: 'tsmu', en: 'Tbilisi State Medical University', ka: 'თბილისის სახელმწიფო სამედიცინო უნივერსიტეტი', ru: 'Тбилисский государственный медицинский университет' },
  { id: 'freeuni', en: 'Free University of Tbilisi', ka: 'თბილისის თავისუფალი უნივერსიტეტი', ru: 'Свободный университет Тбилиси' },
  { id: 'agruni', en: 'Agricultural University of Georgia', ka: 'საქართველოს აგრარული უნივერსიტეტი', ru: 'Аграрный университет Грузии' },
  { id: 'cu', en: 'Caucasus University', ka: 'კავკასიის უნივერსიტეტი', ru: 'Кавказский университет' },
  { id: 'ug', en: 'University of Georgia', ka: 'საქართველოს უნივერსიტეტი', ru: 'Университет Грузии' },
  { id: 'btu', en: 'Business and Technology University (BTU)', ka: 'ბიზნესისა და ტექნოლოგიების უნივერსიტეტი (BTU)', ru: 'Университет бизнеса и технологий (BTU)' },
  { id: 'ibsu', en: 'International Black Sea University', ka: 'შავი ზღვის საერთაშორისო უნივერსიტეტი', ru: 'Международный Черноморский университет' },
  { id: 'gipa', en: 'Georgian Institute of Public Affairs (GIPA)', ka: 'საქართველოს საზოგადოებრივ საქმეთა ინსტიტუტი (GIPA)', ru: 'Грузинский институт общественных дел (GIPA)' },
  { id: 'gau', en: 'Georgian American University', ka: 'ქართულ-ამერიკული უნივერსიტეტი', ru: 'Грузино-Американский университет' },
  { id: 'ciu', en: 'Caucasus International University', ka: 'კავკასიის საერთაშორისო უნივერსიტეტი', ru: 'Кавказский международный университет' },
  { id: 'seu', en: 'Georgian National University SEU', ka: 'საქართველოს ეროვნული უნივერსიტეტი სეუ', ru: 'Грузинский национальный университет SEU' },
  { id: 'alte', en: 'Alte University', ka: 'ალტე უნივერსიტეტი', ru: 'Университет Альте' },
  { id: 'eu', en: 'European University', ka: 'ევროპის უნივერსიტეტი', ru: 'Европейский университет' },
  { id: 'robakidze', en: 'Grigol Robakidze University', ka: 'გრიგოლ რობაქიძის სახელობის უნივერსიტეტი', ru: 'Университет Григола Робакидзе' },
  { id: 'tvildiani', en: 'Tvildiani Medical University', ka: 'ტვილდიანის სამედიცინო უნივერსიტეტი', ru: 'Медицинский университет Твилдиани' },
  { id: 'nvu', en: 'New Vision University', ka: 'ნიუ ვიჟენ უნივერსიტეტი', ru: 'Университет Нью Вижн' },
  { id: 'eeu', en: 'East European University', ka: 'აღმოსავლეთ ევროპის უნივერსიტეტი', ru: 'Восточно-Европейский университет' },
  { id: 'sabauni', en: 'Sulkhan-Saba Orbeliani University', ka: 'სულხან-საბა ორბელიანის უნივერსიტეტი', ru: 'Университет Сулхан-Саба Орбелиани' },
  { id: 'sangu', en: 'St. Andrew the First-Called Georgian University', ka: 'წმიდა ანდრია პირველწოდებულის სახელობის ქართული უნივერსიტეტი', ru: 'Грузинский университет св. Андрея Первозванного' },
  { id: 'sokhumi', en: 'Sokhumi State University', ka: 'სოხუმის სახელმწიფო უნივერსიტეტი', ru: 'Сухумский государственный университет' },
  { id: 'tafu', en: 'Shota Rustaveli Theatre and Film University', ka: 'შოთა რუსთაველის თეატრისა და კინოს სახელმწიფო უნივერსიტეტი', ru: 'Университет театра и кино им. Шота Руставели' },
  { id: 'arts', en: 'Tbilisi State Academy of Arts', ka: 'თბილისის სახელმწიფო სამხატვრო აკადემია', ru: 'Тбилисская государственная академия художеств' },
  { id: 'conservatoire', en: 'Tbilisi State Conservatoire', ka: 'თბილისის სახელმწიფო კონსერვატორია', ru: 'Тбилисская государственная консерватория' },
  { id: 'aviation', en: 'Georgian Aviation University', ka: 'საქართველოს საავიაციო უნივერსიტეტი', ru: 'Грузинский авиационный университет' },
  { id: 'geomedi', en: 'Geomedi University', ka: 'გეომედი', ru: 'Университет Геомеди' },
  { id: 'giu', en: 'International University of Georgia', ka: 'საქართველოს საერთაშორისო უნივერსიტეტი', ru: 'Международный университет Грузии' },
  { id: 'aghmashenebeli', en: 'David Aghmashenebeli University', ka: 'დავით აღმაშენებლის სახელობის უნივერსიტეტი', ru: 'Университет Давида Агмашенебели' },
];

/** The university's name in the page language. */
export function universityName(choice: UniversityChoice | undefined, language: string): string {
  if (!choice) return '';
  return language === 'ka' ? choice.ka : language === 'ru' ? choice.ru : choice.en;
}

/** Search in any of the three names (and short names such as "TSU", "GTU", "თსუ"). */
export function searchUniversities(query: string): UniversityChoice[] {
  const q = normalize(query);
  if (!q) return UNIVERSITY_CHOICES;
  return UNIVERSITY_CHOICES.filter((choice) =>
    [choice.en, choice.ka, choice.ru, choice.id].some((name) => normalize(name).includes(q)),
  );
}
