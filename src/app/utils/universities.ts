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
