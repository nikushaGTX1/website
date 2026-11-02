/**
 * Picture for a Tbilisi district, in the same purple style as the area pickers.
 * Matches English and Georgian names (and common spellings); unknown districts get a map pin.
 */
const ICONS: Array<[RegExp, string]> = [
  [/vake|ვაკე|bagebi|ბაგები/i, 'vake-tree.svg'],
  [/saburtalo|საბურთალო|nutsubidze|ნუცუბიძ|vazha|ვაჟა/i, 'saburtalo-buildings.svg'],
  [/vera|ვერა|sololaki|სოლოლაკ/i, 'vera-heritage-house.svg'],
  [/mtatsminda|მთაწმინდ/i, 'mtatsminda-columns.svg'],
  [/old tbilisi|ძველი თბილის|abanotubani|აბანოთუბან|kala|კალა/i, 'old-tbilisi-fortress.svg'],
  [/avlabari|ავლაბარ|isani|ისანი/i, 'avlabari-cathedral.svg'],
  [/gldani|გლდან|nadzaladevi|ნაძალადევ|temqa|თემქა|mukhiani|მუხიან|zahesi|ზაჰეს/i, 'gldani-blocks.svg'],
  [/chugureti|ჩუღურეთ|ortachala|ორთაჭალ|marjanishvili|მარჯანიშვილ/i, 'chugureti-bridge.svg'],
  [/digomi|dighomi|დიღომ|didube|დიდუბ/i, 'digomi-houses.svg'],
  [/krtsanisi|კრწანის|tskneti|წყნეთ|kojori|კოჯორ|tabakhmela|ტაბახმელ|okrokana|ოქროყან/i, 'hills-pines.svg'],
  [/lisi|ლისი|tbilisi sea|თბილისის ზღვა|kus tba|კუს ტბა/i, 'lake.svg'],
  [/vashlijvari|ვაშლიჯვარ/i, 'vashlijvari-apple.svg'],
  [/samgori|სამგორ|varketili|ვარკეთილ|lilo|ლილო|navtlughi|ნავთლუღ/i, 'samgori-market.svg'],
];

export function districtIcon(district: string | null | undefined): string {
  const name = (district || '').trim();
  const match = ICONS.find(([pattern]) => pattern.test(name));
  return `/icons/areas/${match ? match[1] : 'district.svg'}`;
}
