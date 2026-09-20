/** Human-readable English labels for stored answer codes, so codes like "RemoteWorker" never reach the UI. */
const ANSWER_LABELS: Record<string, string> = {
  // Goal / gender
  Rent: 'Rent',
  Buy: 'Buy',
  Male: 'Male',
  Female: 'Female',
  // Household
  JustMe: 'Just me',
  Couple: 'Couple',
  FamilyWithChildren: 'Family with children',
  ParentWithChildren: 'Family with children',
  Relatives: 'Relatives',
  Roommates: 'Roommates',
  Friends: 'Roommates',
  CorporateHousing: 'Company employees',
  // Districts
  DidiDighomi: 'Didi Dighomi',
  SelectOnMap: 'Select on map',
  // Lifestyle
  Athlete: 'Active and athletic',
  RemoteWorker: 'I work from home',
  BusinessProfessional: 'Business professional',
  Student: 'Student',
  QuietLifestyle: 'Quiet lifestyle',
  SocialLifestyle: 'Social and active lifestyle',
  HostsGuests: 'I often host guests',
  FrequentTraveler: 'I travel frequently',
  // Transport
  Car: 'Car',
  Metro: 'Metro',
  Walking: 'Walking',
  MultipleMethods: 'Multiple methods',
  // Rental duration
  ThreeToFiveMonths: '3–5 months',
  SixMonths: '6 months',
  TwelveMonths: '12 months',
  MoreThanTwelveMonths: 'More than 12 months',
  Unknown: 'I do not know yet',
  // Move-in / purchase timing
  Immediately: 'Immediately',
  WithinOneWeek: 'Within one week',
  WithinOneMonth: 'Within one month',
  SpecificDate: 'Specific date',
  Flexible: 'I am flexible',
  WithinOneToThreeMonths: 'Within 1–3 months',
  WithinThreeToSixMonths: 'Within 3–6 months',
  MoreThanSixMonths: 'More than 6 months from now',
  Exploring: 'I am only exploring the market',
  // Pets
  None: 'No pet',
  Dog: 'Dog',
  Cat: 'Cat',
  Other: 'Other',
  // Priorities
  SelectedLocationNearby: 'Proximity to selected location',
  OfficeNearby: 'Proximity to office',
  MetroNearby: 'Proximity to metro',
  SchoolNearby: 'Proximity to school',
  KindergartenNearby: 'Proximity to kindergarten',
  GymNearby: 'GYM',
  ParkNearby: 'Proximity to park',
  UniversityNearby: 'Proximity to university',
  SupermarketNearby: 'Proximity to supermarket',
  PharmacyNearby: 'Proximity to pharmacy',
  PlaygroundNearby: 'Proximity to playground',
  PlaygroundOrSportsFieldNearby: 'Proximity to playground or sports field',
  ClinicNearby: 'Proximity to clinic',
  PublicTransportNearby: 'Proximity to public transport',
  EverydayServicesNearby: 'Walking access to everyday services',
  CafesNearby: 'Proximity to cafés',
  CafesOrCoworkingNearby: 'Proximity to cafés or coworking spaces',
  CafesAndRestaurantsNearby: 'Proximity to cafés and restaurants',
  MeetingPlacesNearby: 'Proximity to cafés and restaurants for meetings',
  StudySpacesNearby: 'Proximity to cafés or study spaces',
  CityCenterNearby: 'Proximity to city center',
  EntertainmentNearby: 'Proximity to bars and entertainment districts',
  Workspace: 'Workspace',
  Parking: 'Parking',
  QuietStreet: 'Quiet street',
  AwayFromNightlife: 'Away from busy city center and nightlife',
  LargeLivingRoom: 'Large living room',
  BalconyOrTerrace: 'Balcony or terrace',
  MultipleBathrooms: 'Two or more bathrooms',
  SecurityOrConcierge: 'Security or concierge',
  ModernMaintainedBuilding: 'Modern and well-maintained building',
  IsolatedBedrooms: 'Isolated bedrooms',
  CompanyLeaseAvailable: 'Company lease available',
};

export function answerLabel(value: string | undefined | null): string {
  if (!value) return '';
  return ANSWER_LABELS[value] ?? value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function answerList(values: string[] | undefined | null): string {
  return (values || []).map(answerLabel).join(', ');
}

/** Today as yyyy-mm-dd in the user's local time zone (the earliest allowed specific move-in date). */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isPastDate(value: string | undefined | null): boolean {
  return !!value && value < todayIso();
}
