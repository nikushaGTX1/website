/**
 * Builds the listing title and description (Georgian, English, Russian) from everything
 * filled in on the upload form. Empty fields are skipped, so the text grows as the form fills.
 */
export type CopyLang = 'ka' | 'en' | 'ru';
type Tri = [string, string, string];

export interface ListingCopyInput {
  realEstateType: string;
  dealType: string;
  buildingStatus: string;
  condition: string;
  places: Record<CopyLang, string>;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  landArea: number | null;
  floor: number | null;
  totalFloors: number | null;
  features: string[];
  parkingCondition: string;
  parkingCost: string;
  viewType: string;
  apartmentStyle: string;
  minimumRentalPeriod: string;
  availableFrom: string;
  maxOccupants: number | null;
}

const TYPES: Record<string, Tri> = {
  Apartment: ['ბინა', 'apartment', 'квартира'],
  'Private house': ['კერძო სახლი', 'private house', 'частный дом'],
  'Country house': ['აგარაკი', 'country house', 'загородный дом'],
  Plot: ['მიწის ნაკვეთი', 'land plot', 'земельный участок'],
  'Commercial area': ['კომერციული ფართი', 'commercial space', 'коммерческое помещение'],
  Hotel: ['სასტუმრო', 'hotel', 'отель'],
};
const DEALS: Record<string, Tri> = {
  'For Sale': ['იყიდება', 'for sale', 'Продаётся'],
  'For Rent': ['ქირავდება', 'for rent', 'Сдаётся'],
  Lease: ['გრძელვადიანი იჯარით გაიცემა', 'for long-term lease', 'Сдаётся в долгосрочную аренду'],
  'Daily rent': ['ქირავდება დღიურად', 'for daily rent', 'Сдаётся посуточно'],
};
const CONDITIONS: Record<string, Tri> = {
  'Newly Renovated': ['ახალი, ხარისხიანი რემონტით', 'freshly renovated', 'со свежим качественным ремонтом'],
  'Old renovated': ['ძველი რემონტით', 'with an older renovation', 'со старым ремонтом'],
  'Current renovation': ['მიმდინარე რემონტით', 'with renovation in progress', 'с ремонтом в процессе'],
  Repairing: ['სარემონტო მდგომარეობაში', 'in need of renovation', 'требует ремонта'],
  'White frame': ['თეთრი კარკასის მდგომარეობაში', 'in white frame condition', 'в белом каркасе'],
  'Black frame': ['შავი კარკასის მდგომარეობაში', 'in black frame condition', 'в чёрном каркасе'],
  'Green frame': ['მწვანე კარკასის მდგომარეობაში', 'in green frame condition', 'в зелёном каркасе'],
  'White Plus': ['თეთრი პლუს კარკასის მდგომარეობაში', 'in white plus condition', 'в состоянии белый каркас плюс'],
};
const BUILDINGS: Record<string, Tri> = {
  'New building': ['ახალაშენებული', 'new', 'новостройке'],
  'Old building': ['ძველი', 'older', 'старом доме'],
  'Under construction': ['მშენებარე', 'under-construction', 'строящемся доме'],
};
const FEATURES: Record<string, Tri> = {
  hasElevator: ['ლიფტი', 'Elevator', 'Лифт'],
  isQuietStreet: ['წყნარი ქუჩა', 'Quiet street', 'Тихая улица'],
  hasBalcony: ['აივანი', 'Balcony', 'Балкон'],
  hasBathtub: ['აბაზანა (ვანით)', 'Bathtub', 'Ванна'],
  hasAirConditioning: ['კონდიციონერი', 'Air conditioning', 'Кондиционер'],
  hasDishwasher: ['ჭურჭლის სარეცხი მანქანა', 'Dishwasher', 'Посудомоечная машина'],
  isPetFriendly: ['შინაური ცხოველები დაშვებულია', 'Pets allowed', 'Можно с животными'],
  hasHomeOfficeSpace: ['სამუშაო სივრცე სახლში', 'Home office space', 'Место для работы из дома'],
  hasLargeKitchen: ['ფართო სამზარეულო', 'Spacious kitchen', 'Просторная кухня'],
  hasView: ['ლამაზი ხედი', 'Beautiful view', 'Красивый вид'],
  isFurnished: ['სრულად ავეჯით და ტექნიკით', 'Fully furnished with appliances', 'Полностью меблирована, с техникой'],
  hasCoworkingNearby: ['ქოვორქინგი ახლოს', 'Coworking nearby', 'Коворкинг рядом'],
  hasSecurity: ['დაცვა / კონსიერჟი', 'Security / concierge', 'Охрана / консьерж'],
  isModernBuilding: ['თანამედროვე, მოვლილი შენობა', 'Modern, well-kept building', 'Современный ухоженный дом'],
  hasIsolatedBedrooms: ['იზოლირებული საძინებლები', 'Separate bedrooms', 'Изолированные спальни'],
  hasCompanyLease: ['კომპანიაზე იჯარის გაფორმება შესაძლებელია', 'Company lease possible', 'Возможна аренда на компанию'],
};
const PARKING: Record<string, Tri> = {
  Garage: ['გარაჟი', 'garage', 'гараж'],
  PrivateCourtyard: ['კერძო ეზოს პარკინგი', 'private courtyard parking', 'частная парковка во дворе'],
  CourtyardWithBarrier: ['ეზო შლაგბაუმით', 'gated courtyard parking', 'двор со шлагбаумом'],
  CourtyardWithoutBarrier: ['ეზოში პარკინგი', 'courtyard parking', 'парковка во дворе'],
  StreetParking: ['ქუჩაში პარკინგი', 'street parking', 'парковка на улице'],
};
const VIEWS: Record<string, Tri> = {
  'City View': ['ქალაქის ხედით', 'with a city view', 'с видом на город'],
  'Nature View': ['ბუნების ხედით', 'with a view of nature', 'с видом на природу'],
};

const t = (map: Record<string, Tri>, key: string, lang: CopyLang): string => {
  const row = map[key];
  return row ? row[lang === 'ka' ? 0 : lang === 'en' ? 1 : 2] : '';
};
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** "ვაკე" -> "ვაკეში", "გლდანი" -> "გლდანში". */
const kaIn = (name: string) => `${name.endsWith('ი') ? name.slice(0, -1) : name}ში`;
const KA_FROM = ['იანვრიდან', 'თებერვლიდან', 'მარტიდან', 'აპრილიდან', 'მაისიდან', 'ივნისიდან', 'ივლისიდან', 'აგვისტოდან', 'სექტემბრიდან', 'ოქტომბრიდან', 'ნოემბრიდან', 'დეკემბრიდან'];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ruPlural = (n: number, forms: [string, string, string]) => {
  const d = n % 10, h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? forms[0] : d >= 2 && d <= 4 && (h < 12 || h > 14) ? forms[1] : forms[2]}`;
};
const date = (value: string, lang: CopyLang): string => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long' });
};

export function buildListingCopy(f: ListingCopyInput): Record<CopyLang, { title: string; description: string }> {
  const rent = f.dealType !== 'For Sale';
  const isLand = f.realEstateType === 'Plot';
  const out = {} as Record<CopyLang, { title: string; description: string }>;
  for (const lang of ['ka', 'en', 'ru'] as CopyLang[]) {
    const type = t(TYPES, f.realEstateType, lang) || (lang === 'ka' ? 'უძრავი ქონება' : lang === 'en' ? 'property' : 'недвижимость');
    const deal = t(DEALS, f.dealType, lang) || t(DEALS, 'For Sale', lang);
    const place = f.places[lang];
    const condition = isLand ? '' : t(CONDITIONS, f.condition, lang);
    const building = t(BUILDINGS, f.buildingStatus, lang);
    const view = t(VIEWS, f.viewType, lang);
    const features = f.features.map((key) => t(FEATURES, key, lang)).filter(Boolean);
    const parking = t(PARKING, f.parkingCondition, lang);
    const parkingCost = f.parkingCost === 'Free'
      ? (lang === 'ka' ? 'უფასო' : lang === 'en' ? 'free' : 'бесплатно')
      : f.parkingCost === 'Paid' ? (lang === 'ka' ? 'ფასიანი' : lang === 'en' ? 'paid' : 'платно') : '';
    const available = rent ? date(f.availableFrom, lang) : '';
    const sentences: string[] = [];
    const bullets: string[] = [];
    let title = '';
    let closing = '';

    if (lang === 'ka') {
      const rooms = f.rooms ? `${f.rooms}-ოთახიანი ` : '';
      const where = place ? kaIn(place) : 'თბილისში';
      title = `${deal} ${rooms}${type} ${where}${view ? `, ${view}` : ''}`;
      sentences.push(`${deal} ${f.area ? `${f.area} მ² ფართის ` : ''}${rooms}${type} ${where}${condition ? `, ${condition}` : ''}.`);
      if (!isLand && (f.floor != null || f.totalFloors)) {
        const of = f.totalFloors ? `${f.totalFloors}-სართულიანი ${building ? `${building} ` : ''}კორპუსის ` : building ? `${building} კორპუსის ` : '';
        sentences.push(`${type} მდებარეობს ${of}${f.floor != null ? (f.floor > 1 ? `მე-${f.floor} სართულზე` : f.floor === 1 ? 'პირველ სართულზე' : `${f.floor} სართულზე`) : ''}.`.replace(' .', '.'));
      }
      const layout = [f.bedrooms ? `${f.bedrooms} საძინებელი` : '', f.bathrooms ? `${f.bathrooms} სველი წერტილი` : ''].filter(Boolean);
      if (layout.length) sentences.push(`${kaIn(type)} არის ${layout.join(' და ')}.`);
      if (f.landArea) sentences.push(`${isLand ? 'მიწის ფართობი' : 'ეზოს ფართობი'}: ${f.landArea} მ².`);
      if (f.apartmentStyle === 'Modern') sentences.push('ინტერიერი თანამედროვე სტილშია გადაწყვეტილი.');
      if (f.apartmentStyle === 'Vintage') sentences.push('ინტერიერი კლასიკურ, ვინტაჟურ სტილშია.');
      if (parking) bullets.push(`პარკინგი: ${parking}${parkingCost ? ` (${parkingCost})` : ''}`);
      bullets.push(...features);
      const terms = [
        rent && f.availableFrom && !Number.isNaN(new Date(f.availableFrom).getTime()) ? `თავისუფალია ${new Date(f.availableFrom).getDate()} ${KA_FROM[new Date(f.availableFrom).getMonth()]}` : '',
        f.minimumRentalPeriod === 'Minimum 6 months' ? 'მინიმალური ვადა — 6 თვე' : f.minimumRentalPeriod === 'Minimum 12 months' ? 'მინიმალური ვადა — 12 თვე' : '',
        rent && f.maxOccupants ? `მაქსიმუმ ${f.maxOccupants} მცხოვრები` : '',
      ].filter(Boolean);
      if (terms.length) sentences.push(`${terms.join('; ')}.`);
      closing = 'დაგვიკავშირდით დამატებითი ინფორმაციისა და ნახვის დასაგეგმად.';
    } else if (lang === 'en') {
      const rooms = f.rooms ? `${f.rooms}-room ` : '';
      const where = place ? `${place}, Tbilisi` : 'Tbilisi';
      title = `${cap(`${rooms}${type}`)} ${deal} in ${where}`;
      sentences.push(`${cap(`${f.area ? `${f.area} m² ` : ''}${rooms}${type}`)} ${deal} in ${where}${condition ? `, ${condition}` : ''}${view ? `, ${view}` : ''}.`);
      if (!isLand && (f.floor != null || f.totalFloors)) {
        sentences.push(`Located${f.floor != null ? ` on floor ${f.floor}` : ''}${f.totalFloors ? ` of a ${f.totalFloors}-storey${building ? ` ${building}` : ''} building` : building ? ` in a ${building} building` : ''}.`);
      }
      const layout = [f.bedrooms ? plural(f.bedrooms, 'bedroom', 'bedrooms') : '', f.bathrooms ? plural(f.bathrooms, 'bathroom', 'bathrooms') : ''].filter(Boolean);
      if (layout.length) sentences.push(`It has ${layout.join(' and ')}.`);
      if (f.landArea) sentences.push(`${isLand ? 'Land area' : 'Yard area'}: ${f.landArea} m².`);
      if (f.apartmentStyle === 'Modern') sentences.push('The interior is modern.');
      if (f.apartmentStyle === 'Vintage') sentences.push('The interior has a classic, vintage character.');
      if (parking) bullets.push(`Parking: ${parking}${parkingCost ? ` (${parkingCost})` : ''}`);
      bullets.push(...features);
      const terms = [
        available ? `available from ${available}` : '',
        f.minimumRentalPeriod === 'Minimum 6 months' ? 'minimum stay 6 months' : f.minimumRentalPeriod === 'Minimum 12 months' ? 'minimum stay 12 months' : '',
        rent && f.maxOccupants ? `up to ${plural(f.maxOccupants, 'resident', 'residents')}` : '',
      ].filter(Boolean);
      if (terms.length) sentences.push(`${cap(terms.join('; '))}.`);
      closing = 'Get in touch for more details or to arrange a viewing.';
    } else {
      const rooms = f.rooms ? `${f.rooms}-комнатная ` : '';
      const where = place ? `${place}, Тбилиси` : 'Тбилиси';
      title = `${deal} ${rooms}${type} — ${where}`;
      sentences.push(`${deal} ${rooms}${type}${f.area ? ` площадью ${f.area} м²` : ''} — ${where}${condition ? `, ${condition}` : ''}${view ? `, ${view}` : ''}.`);
      if (!isLand && (f.floor != null || f.totalFloors)) {
        sentences.push(`Расположена${f.floor != null ? ` на ${f.floor} этаже` : ''}${f.totalFloors ? ` ${f.totalFloors}-этажного ${building === 'новостройке' ? 'нового ' : ''}дома` : building ? ` в ${building}` : ''}.`);
      }
      const layout = [f.bedrooms ? ruPlural(f.bedrooms, ['спальня', 'спальни', 'спален']) : '', f.bathrooms ? ruPlural(f.bathrooms, ['санузел', 'санузла', 'санузлов']) : ''].filter(Boolean);
      if (layout.length) sentences.push(`${layout.join(' и ')}.`.replace(/^./, (c) => c.toUpperCase()));
      if (f.landArea) sentences.push(`${isLand ? 'Площадь участка' : 'Площадь двора'}: ${f.landArea} м².`);
      if (f.apartmentStyle === 'Modern') sentences.push('Современный интерьер.');
      if (f.apartmentStyle === 'Vintage') sentences.push('Классический, винтажный интерьер.');
      if (parking) bullets.push(`Парковка: ${parking}${parkingCost ? ` (${parkingCost})` : ''}`);
      bullets.push(...features);
      const terms = [
        available ? `свободна с ${available}` : '',
        f.minimumRentalPeriod === 'Minimum 6 months' ? 'минимальный срок — 6 месяцев' : f.minimumRentalPeriod === 'Minimum 12 months' ? 'минимальный срок — 12 месяцев' : '',
        rent && f.maxOccupants ? `до ${f.maxOccupants} жильцов` : '',
      ].filter(Boolean);
      if (terms.length) sentences.push(`${cap(terms.join('; '))}.`);
      closing = 'Свяжитесь с нами, чтобы узнать подробности или договориться о просмотре.';
    }

    const head = lang === 'ka' ? 'უპირატესობები:' : lang === 'en' ? 'Highlights:' : 'Преимущества:';
    const parts = [sentences.join(' ')];
    if (bullets.length) parts.push(`${head}\n${bullets.map((b) => `• ${b}`).join('\n')}`);
    parts.push(closing);
    out[lang] = { title: title.replace(/\s+/g, ' ').trim(), description: parts.join('\n\n') };
  }
  return out;
}
