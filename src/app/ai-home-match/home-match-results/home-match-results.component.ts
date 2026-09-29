import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { HomeMatchResult } from '../models/home-match-result';
import { toMediaUrl } from '../../utils/api-media';
import { HomeMatchProfile } from '../models/home-match-profile';
import { applyPriorityScoring, everydayServicesMinutes, parkingScore, scorePriority } from '../services/priority-scoring';
import { answerLabel } from '../services/answer-labels';
import { evaluateMandatoryRequirements } from '../services/mandatory-requirements';
import { ApartmentService } from '../../services/apartment.service';
import { parseParkingCost } from '../../utils/parking-cost';

interface LifestyleInsight {
  title: string;
  reason: string;
  icon: string;
  /** Optional short value shown as a badge, e.g. "5 min". */
  meta?: string;
}

/** A nearby place counts as a match only within this walk (the 'nearby' edge of priority scoring). */
const MATCH_WALK_LIMIT = 18;
@Component({
  selector: 'app-home-match-results',
  standalone: false,
  templateUrl: './home-match-results.component.html',
  styleUrl: './home-match-results.component.css',
})
export class HomeMatchResultsComponent implements OnChanges {
  @Input() matches: HomeMatchResult[] = [];
  @Input({ required: true }) profile!: HomeMatchProfile;
  @Output() edit = new EventEmitter<void>();
  readonly enrichingApartmentIds = new Set<number>();
  private readonly failedImageIndexes = new WeakMap<HTMLImageElement, number>();
  private readonly attemptedEnrichment = new WeakSet<HomeMatchResult>();

  constructor(private readonly apartmentService: ApartmentService, private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['matches']) {
      this.matches.forEach((result) => {
        Object.assign(result, applyPriorityScoring(result, this.profile));
        result.requirement = evaluateMandatoryRequirements(result.apartment, this.profile);
        if (!this.imageCandidates(result).length) this.enrichApartment(result);
      });
    }
  }
  /** Homes that fail a mandatory requirement stay hidden until the user asks for alternatives. */
  showAlternatives = false;

  private byStatus(status: 'exact' | 'confirm' | 'alternative'): HomeMatchResult[] {
    return this.matches
      .filter((result) => (result.requirement?.status ?? 'exact') === status)
      .sort((a, b) => (b.rankingScore ?? b.matchScore) - (a.rankingScore ?? a.matchScore));
  }
  /** Meet every mandatory requirement and need no confirmation. */
  get exactMatches(): HomeMatchResult[] {
    return this.byStatus('exact');
  }
  /** Meet every requirement we can check, but something must be confirmed with the owner. */
  get confirmMatches(): HomeMatchResult[] {
    return this.byStatus('confirm');
  }
  get alternativeMatches(): HomeMatchResult[] {
    return this.byStatus('alternative');
  }
  /** One URL per photo, cover first. Cached per apartment so the gallery DOM stays stable. */
  private readonly galleryCache = new Map<HomeMatchResult['apartment'], string[][]>();
  readonly galleryIndex = new Map<number, number>();

  /** Each slide carries fallback sources (signed url, then storage path) tried in order on error. */
  gallery(result: HomeMatchResult): string[][] {
    const apartment = result.apartment;
    const cached = this.galleryCache.get(apartment);
    if (cached) return cached;
    const ordered = [...(apartment.images || [])].sort(
      (a, b) => Number(b.isCover) - Number(a.isCover) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    const clean = (sources: Array<string | undefined>) =>
      [...new Set(sources.map((source) => toMediaUrl(source)).filter((source): source is string => !!source))];
    const seen = new Set<string>();
    const slides = [
      ...ordered.map((item) => clean([item.url, item.storagePath])),
      ...(apartment.imageUrls || []).map((url) => clean([url])),
      clean([apartment.imageUrl]),
    ].filter((sources) => sources.length && !sources.some((source) => seen.has(source)) && (sources.forEach((s) => seen.add(s)), true));
    if (!slides.length) {
      // The match list can arrive without photos; load the full listing once, then rebuild.
      queueMicrotask(() => this.enrichApartment(result));
      return [['/property-placeholder.svg']];
    }
    this.galleryCache.set(apartment, slides);
    return slides;
  }

  onSlideError(event: Event, result: HomeMatchResult, sources: string[]): void {
    const image = event.target as HTMLImageElement;
    const next = sources[sources.indexOf(image.getAttribute('src') || '') + 1];
    if (next) {
      image.src = next;
      return;
    }
    image.closest('.slide')?.classList.add('broken');
    const track = image.closest('.mc-track');
    if (track && !track.querySelector('.slide:not(.broken)')) {
      // Every photo failed: refresh the listing (fresh signed urls) and rebuild the gallery.
      this.galleryCache.delete(result.apartment);
      this.enrichApartment(result);
    }
  }

  onGalleryScroll(result: HomeMatchResult, track: HTMLElement): void {
    const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (this.galleryIndex.get(result.apartment.id) !== index) this.galleryIndex.set(result.apartment.id, index);
  }

  moveGallery(result: HomeMatchResult, track: HTMLElement, step: number): void {
    const count = this.gallery(result).length;
    const current = this.galleryIndex.get(result.apartment.id) ?? 0;
    const next = (current + step + count) % count;
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  }

  image(result: HomeMatchResult): string {
    return this.imageCandidates(result)[0] || '/property-placeholder.svg';
  }

  private imageCandidates(result: HomeMatchResult): string[] {
    const images = [...(result.apartment.images || [])].sort(
      (a, b) => Number(b.isCover) - Number(a.isCover) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    return [
      ...new Set(
        [
          ...images.flatMap((item) => [item.url, item.storagePath]),
          ...(result.apartment.imageUrls || []),
          result.apartment.imageUrl,
        ]
          .map((source) => toMediaUrl(source))
          .filter(Boolean),
      ),
    ];
  }

  onImageError(event: Event, result: HomeMatchResult): void {
    const image = event.target as HTMLImageElement;
    if (image.classList.contains('placeholder-image')) return;
    const nextIndex = (this.failedImageIndexes.get(image) ?? 0) + 1;
    const nextImage = this.imageCandidates(result)[nextIndex];
    this.failedImageIndexes.set(image, nextIndex);
    if (nextImage) image.src = nextImage;
    else {
      this.enrichApartment(result, image);
    }
  }

  private enrichApartment(result: HomeMatchResult, image?: HTMLImageElement): void {
    const apartmentId = Number(result.apartment.id);
    if (!Number.isFinite(apartmentId) || this.enrichingApartmentIds.has(apartmentId) || this.attemptedEnrichment.has(result)) {
      if (image) this.showPlaceholder(image);
      return;
    }

    this.attemptedEnrichment.add(result);
    this.enrichingApartmentIds.add(apartmentId);
    this.apartmentService.getApartment(apartmentId).pipe(
      timeout(15000),
      finalize(() => {
        this.enrichingApartmentIds.delete(apartmentId);
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: (apartment) => {
        Object.assign(result.apartment, apartment);
        this.galleryCache.delete(result.apartment);
        this.homeDetailsCache.delete(result.apartment);
        this.answerMatchCache.delete(result.apartment);
        this.walkingCache.delete(result.apartment);
        this.enrichingApartmentIds.delete(apartmentId);
        if (image) {
          const source = this.imageCandidates(result)[0];
          if (source) {
            this.failedImageIndexes.set(image, 0);
            image.classList.remove('placeholder-image');
            image.src = source;
          } else {
            this.showPlaceholder(image);
          }
        }
      },
      error: () => {
        this.enrichingApartmentIds.delete(apartmentId);
        if (image) this.showPlaceholder(image);
      },
    });
  }

  private showPlaceholder(image: HTMLImageElement): void {
    image.onerror = null;
    image.classList.add('placeholder-image');
    image.src = '/property-placeholder.svg';
  }

  cardLabel(kind: 'exact' | 'confirm' | 'alternative', index: number): string {
    if (kind === 'confirm') return 'Needs confirmation';
    if (kind === 'alternative') return 'Alternative';
    return this.rankLabel(index);
  }

  cardHeadline(kind: 'exact' | 'confirm' | 'alternative', index: number): string {
    if (kind === 'confirm') return 'Possible match. Please confirm the details below.';
    if (kind === 'alternative') return 'Does not meet all of your requirements';
    return this.rankHeadline(index);
  }

  rankHeadline(index: number): string {
    if (index === 0) return 'Based on your profile, this is the best match for you';
    return `Based on your profile, this is your ${this.ordinal(index + 1)} best match`;
  }

  rankLabel(index: number): string {
    return index === 0 ? 'Top recommendation' : `${this.ordinal(index + 1)} recommendation`;
  }

  private ordinal(value: number): string {
    const remainder = value % 100;
    if (remainder >= 11 && remainder <= 13) return `${value}th`;
    return `${value}${value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'}`;
  }

  mapAddress(result: HomeMatchResult): string {
    return (
      result.apartment.address || result.apartment.district || `${result.apartment.title}, Tbilisi`
    );
  }

  latitude(result: HomeMatchResult): number | undefined {
    const value = Number(result.apartment.propertyLatitude ?? result.apartment.latitude);
    return Number.isFinite(value) && value >= 40.8 && value <= 43.7 ? value : undefined;
  }

  longitude(result: HomeMatchResult): number | undefined {
    const value = Number(result.apartment.propertyLongitude ?? result.apartment.longitude);
    return Number.isFinite(value) && value >= 39.8 && value <= 46.8 ? value : undefined;
  }

  mapsUrl(result: HomeMatchResult): string {
    const latitude = this.latitude(result);
    const longitude = this.longitude(result);
    const query =
      latitude !== undefined && longitude !== undefined
        ? `${latitude},${longitude}`
        : this.mapAddress(result);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  private readonly answerMatchCache = new Map<HomeMatchResult['apartment'], LifestyleInsight[]>();
  private readonly walkingCache = new Map<HomeMatchResult['apartment'], Array<{ label: string; minutes: number; icon: string }>>();

  /**
   * "Why this home fits you": each questionnaire answer this home satisfies, with the
   * listing's value next to it. Failed answers are already listed as mismatches above.
   */
  answerMatches(result: HomeMatchResult): LifestyleInsight[] {
    const apartment = result.apartment;
    const cached = this.answerMatchCache.get(apartment);
    if (cached) return cached;
    const p = this.profile;
    const rent = p.propertyGoal !== 'Buy';
    const mismatch = (prefix: string) => (result.requirement?.mismatches || []).some((note) => note.startsWith(prefix));
    const items: LifestyleInsight[] = [];
    const add = (title: string, reason: string, icon: string) => items.push({ title, reason, icon });

    const districts = p.districts.filter((d) => d !== 'SelectOnMap');
    if ((districts.length || p.selectedMapArea) && !p.locationFlexible && !mismatch('Location')) {
      add('Location matches', apartment.district || apartment.address || '', 'fa-location-dot');
    }
    if (p.budgetMax > 0 && apartment.price <= p.budgetMax) {
      add('Within your budget', `$${Math.round(apartment.price).toLocaleString('en-US')} ≤ $${p.budgetMax.toLocaleString('en-US')}`, 'fa-wallet');
    }
    if (p.bedrooms != null && p.bedrooms > 0 && apartment.bedrooms != null && apartment.bedrooms >= p.bedrooms) {
      add('Enough bedrooms', `${apartment.bedrooms} ≥ ${p.bedrooms}`, 'fa-bed');
    }
    if (rent && p.moveInTiming && !mismatch('Availability')) {
      add('Ready for your move-in', answerLabel(p.moveInTiming), 'fa-calendar-check');
    }
    if (rent && p.rentalDuration && !mismatch('Lease')) {
      add('Fits your rental period', answerLabel(p.rentalDuration), 'fa-hourglass-half');
    }
    if (rent && p.hasPet && apartment.isPetFriendly) add('Pet-friendly home', answerLabel(p.petType) || 'Pet', 'fa-paw');
    const priorities = new Set(p.topPriorities.slice(0, 5));
    // One parking card, whether parking came from driving or from the priority list.
    if ((p.transportation.includes('Car') || priorities.has('Parking')) && (apartment.hasParking || parkingScore(apartment) > 0)) {
      add('Parking for your car', parseParkingCost(apartment.description || '').cost === 'Paid' ? 'Paid parking' : 'Parking available', 'fa-square-parking');
    }
    if ((priorities.has('QuietStreet') || p.lifestyles.includes('QuietLifestyle')) && apartment.isQuietStreet) {
      add('Quiet street', 'Matches your quiet lifestyle', 'fa-volume-xmark');
    }
    if (priorities.has('SelectedLocationNearby') && scorePriority('SelectedLocationNearby', apartment, p) >= 2) {
      add('Near the place you chose', 'Close to your chosen location', 'fa-location-crosshairs');
    }

    // Nearby places: shown here only when they answer something the user chose, with the
    // reason tied to that answer. Everything else nearby stays in "Walking times" only.
    for (const place of this.preferencePlaces(result)) {
      const minutes = apartment[place.field];
      if (typeof minutes !== 'number' || minutes < 0 || minutes > MATCH_WALK_LIMIT) continue;
      items.push({ title: place.title, reason: place.reason, icon: place.icon, meta: `${Math.round(minutes)} min` });
    }
    this.answerMatchCache.set(apartment, items);
    return items;
  }

  /**
   * Which nearby places matter to this user, and why. Each entry comes from a questionnaire
   * answer (lifestyle, household, pet, transport) or a chosen top-5 priority; the first
   * matching reason wins, so a place is never listed twice.
   */
  private preferencePlaces(result: HomeMatchResult): Array<{
    field: keyof HomeMatchResult['apartment']; title: string; reason: string; icon: string;
  }> {
    const p = this.profile;
    const priorities = new Set(p.topPriorities.slice(0, 5));
    const lifestyles = new Set(p.lifestyles);
    const ages = new Set(p.children > 0 ? p.childrenAgeGroups : []);
    const hasKids = p.children > 0;
    const dog = !!p.hasPet && p.petType === 'Dog';
    const walks = p.transportation.includes('Walking');
    const places: Array<{ field: keyof HomeMatchResult['apartment']; title: string; reason: string; icon: string }> = [];
    const offer = (
      field: keyof HomeMatchResult['apartment'], title: string, icon: string, reasons: Array<[boolean, string]>,
    ) => {
      const reason = reasons.find(([applies]) => applies)?.[1];
      if (reason) places.push({ field, title, icon, reason });
    };

    offer('gymDistanceMinutes', 'Gym', 'fa-dumbbell', [
      [lifestyles.has('Athlete'), 'Matches your active lifestyle'],
      [priorities.has('GymNearby'), 'One of your top priorities'],
    ]);
    offer('parkDistanceMinutes', 'Park', 'fa-tree', [
      [dog, 'Great for walking your dog'],
      [hasKids && (priorities.has('PlaygroundNearby') || priorities.has('PlaygroundOrSportsFieldNearby')), 'Playground and outdoor space for your children'],
      [lifestyles.has('Athlete'), 'Matches your outdoor lifestyle'],
      [priorities.has('ParkNearby'), 'One of your top priorities'],
      [lifestyles.has('QuietLifestyle'), 'Green space for a calm routine'],
    ]);
    offer('schoolDistanceMinutes', 'School', 'fa-school', [
      [hasKids && (ages.has('Age7To12') || ages.has('Age13To17') || priorities.has('SchoolNearby')), 'Close for your children'],
      [priorities.has('SchoolNearby'), 'One of your top priorities'],
    ]);
    offer('kindergartenDistanceMinutes', 'Kindergarten', 'fa-children', [
      [hasKids && (ages.has('Age0To3') || ages.has('Age4To6') || priorities.has('KindergartenNearby')), 'Close for your little ones'],
      [priorities.has('KindergartenNearby'), 'One of your top priorities'],
    ]);
    offer('universityDistanceMinutes', 'University', 'fa-graduation-cap', [
      [lifestyles.has('Student'), 'Handy for your studies'],
      [priorities.has('UniversityNearby'), 'One of your top priorities'],
    ]);
    const everyday = priorities.has('EverydayServicesNearby') || priorities.has('SupermarketNearby') || priorities.has('PharmacyNearby');
    offer('groceryDistanceMinutes', 'Supermarket', 'fa-basket-shopping', [
      [everyday, 'Everyday shopping on foot'],
      [walks, 'Everyday shopping on foot'],
    ]);
    offer('pharmacyDistanceMinutes', 'Pharmacy', 'fa-prescription-bottle-medical', [
      [everyday || priorities.has('ClinicNearby'), 'Everyday services close by'],
    ]);
    offer('metroDistanceMinutes', 'Metro', 'fa-train-subway', [
      [p.transportation.includes('Metro'), 'Metro is part of your routine'],
      [priorities.has('MetroNearby') || priorities.has('PublicTransportNearby'), 'One of your top priorities'],
    ]);
    offer('cafeDistanceMinutes', 'Café', 'fa-mug-hot', [
      [lifestyles.has('RemoteWorker') || priorities.has('CafesOrCoworkingNearby'), 'Good for working remotely'],
      [lifestyles.has('SocialLifestyle') || priorities.has('CafesAndRestaurantsNearby') || priorities.has('CafesNearby'), 'Matches your social lifestyle'],
      [lifestyles.has('BusinessProfessional') || priorities.has('MeetingPlacesNearby'), 'Handy for meetings'],
      [lifestyles.has('Student') || priorities.has('StudySpacesNearby'), 'A place to study nearby'],
    ]);
    offer('evChargerDistanceMinutes', 'EV charger', 'fa-charging-station', [
      [p.transportation.includes('Car') && p.carFuelType === 'Electric', 'For your electric car'],
    ]);
    return places;
  }

  /** Walking minutes to every nearby place the listing has, closest first. */
  walkingTimes(result: HomeMatchResult): Array<{ label: string; minutes: number; icon: string }> {
    const apartment = result.apartment;
    const cached = this.walkingCache.get(apartment);
    if (cached) return cached;
    const places: Array<[string, number | undefined, string]> = [
      ['Supermarket', apartment.groceryDistanceMinutes, 'fa-basket-shopping'],
      ['Pharmacy', apartment.pharmacyDistanceMinutes, 'fa-prescription-bottle-medical'],
      ['Gym', apartment.gymDistanceMinutes, 'fa-dumbbell'],
      ['Metro', apartment.metroDistanceMinutes, 'fa-train-subway'],
      ['Park', apartment.parkDistanceMinutes, 'fa-tree'],
      ['Café', apartment.cafeDistanceMinutes, 'fa-mug-hot'],
      ['School', apartment.schoolDistanceMinutes, 'fa-school'],
      ['Kindergarten', apartment.kindergartenDistanceMinutes, 'fa-children'],
      ['University', apartment.universityDistanceMinutes, 'fa-graduation-cap'],
      ['EV charger', apartment.evChargerDistanceMinutes, 'fa-charging-station'],
    ];
    const value = places
      // Only genuinely walkable places: 10 minutes or less.
      .filter((place): place is [string, number, string] => typeof place[1] === 'number' && place[1] >= 0 && place[1] <= 10)
      .map(([label, minutes, icon]) => ({ label, minutes: Math.round(minutes), icon }))
      .sort((a, b) => a.minutes - b.minutes);
    if (!value.length) {
      // Match results can arrive without walking data; load the full listing once, then rebuild.
      queueMicrotask(() => this.enrichApartment(result));
      return value;
    }
    this.walkingCache.set(apartment, value);
    return value;
  }

  /** Cached per apartment: a fresh array each change-detection pass would rebuild the DOM (and re-run translation). */
  private readonly homeDetailsCache = new Map<HomeMatchResult['apartment'], Array<{ label: string; value: string; icon: string }>>();

  homeDetails(result: HomeMatchResult): Array<{ label: string; value: string; icon: string }> {
    const apartment = result.apartment;
    const cached = this.homeDetailsCache.get(apartment);
    if (cached) return cached;
    const details: Array<{ label: string; value: string; icon: string }> = [];
    if (apartment.sizeSquareMeters) details.push({ label: 'Area', value: `${apartment.sizeSquareMeters} m²`, icon: 'fa-ruler-combined' });
    if (apartment.floor != null) {
      details.push({ label: 'Floor', value: apartment.totalFloors ? `${apartment.floor} / ${apartment.totalFloors}` : `${apartment.floor}`, icon: 'fa-stairs' });
    }
    if (apartment.bathrooms) details.push({ label: 'Bathrooms', value: `${apartment.bathrooms}`, icon: 'fa-bath' });
    if (this.profile?.propertyGoal !== 'Buy') {
      const available = apartment.availableFrom?.slice(0, 10);
      details.push({
        label: 'Move-in',
        value: available && available > new Date().toISOString().slice(0, 10) ? available : 'Available now',
        icon: 'fa-calendar-check',
      });
      const minimum = /(\d+)\s*month/i.exec(apartment.minimumRentalPeriod || '')?.[1];
      if (minimum) details.push({ label: 'Minimum stay', value: `${minimum} months`, icon: 'fa-hourglass-half' });
    }
    const parking = parseParkingCost(apartment.description || '');
    if (parking.cost === 'Paid') {
      // Kept as separate strings so the page translator can match "Paid parking" / "Paid".
      const price = parking.price != null ? `+${parking.currency === 'GEL' ? '₾' : '$'}${parking.price.toLocaleString('en-US')}` : 'Paid';
      details.push({ label: 'Paid parking', value: price, icon: 'fa-square-parking' });
    } else if (apartment.hasParking) {
      details.push({ label: 'Parking', value: parking.cost === 'Free' ? 'Free' : 'Available', icon: 'fa-square-parking' });
    }
    if (apartment.isFurnished != null) details.push({ label: 'Furniture', value: apartment.isFurnished ? 'Furnished' : 'Unfurnished', icon: 'fa-couch' });
    this.homeDetailsCache.set(apartment, details);
    return details;
  }

  hasNearbyTimes(result: HomeMatchResult): boolean {
    const apartment = result.apartment;
    const relevantTimes = [
      apartment.groceryDistanceMinutes,
      apartment.gymDistanceMinutes,
      apartment.metroDistanceMinutes,
      apartment.cafeDistanceMinutes,
    ];
    if (this.isFamilyProfile()) {
      relevantTimes.push(
        apartment.schoolDistanceMinutes,
        apartment.kindergartenDistanceMinutes,
      );
    }
    return relevantTimes.some((value) => value !== undefined && value !== null);
  }

  isFamilyProfile(): boolean {
    return (
      this.profile.children > 0 ||
      this.profile.householdType === 'FamilyWithChildren'
    );
  }

  lifestyleInsights(result: HomeMatchResult): LifestyleInsight[] {
    const apartment = result.apartment;
    const insights: LifestyleInsight[] = [];
    const add = (title: string, reason: string, icon: string): void => {
      if (!insights.some((item) => item.title === title)) insights.push({ title, reason, icon });
    };
    const childAges = new Set(
      this.isFamilyProfile() && this.profile.children > 0
        ? this.profile.childrenAgeGroups.slice(0, this.profile.children)
        : [],
    );
    const lifestyles = new Set(this.profile.lifestyles);
    const drives = this.profile.transportation.includes('Car');
    const hasDog = this.profile.hasPet === true && this.profile.petType === 'Dog';

    // A nearby park is more meaningful for a dog owner than the generic
    // athlete/family explanation, so keep it first and protect it from the
    // six-insight limit below.
    if (hasDog && apartment.parkDistanceMinutes != null) {
      add(
        `Park ${apartment.parkDistanceMinutes} min away`,
        'Because you can walk your dog nearby',
        'fa-dog',
      );
    }

    if (
      drives &&
      this.profile.carFuelType === 'Electric' &&
      apartment.evChargerDistanceMinutes != null &&
      apartment.evChargerDistanceMinutes <= 10
    ) {
      add(
        `Electric charger in ${apartment.evChargerDistanceMinutes} min`,
        'Because you have an electric car',
        'fa-charging-station',
      );
    }

    if (apartment.kindergartenDistanceMinutes != null && (childAges.has('Age0To3') || childAges.has('Age4To6'))) {
      add(
        `Kindergarten ${apartment.kindergartenDistanceMinutes} min away`,
        childAges.has('Age4To6')
          ? 'Because you have a 4–6-year-old child'
          : 'Because you have a young child',
        'fa-shapes',
      );
    }
    if (apartment.schoolDistanceMinutes != null && (childAges.has('Age7To12') || childAges.has('Age13To17'))) {
      add(
        `School ${apartment.schoolDistanceMinutes} min away`,
        'Because you have a school-age child',
        'fa-school',
      );
    }
    if (apartment.gymDistanceMinutes != null && lifestyles.has('Athlete')) {
      add(
        `Gym ${apartment.gymDistanceMinutes} min away`,
        'Because you have an active lifestyle',
        'fa-dumbbell',
      );
    }
    const everyday = everydayServicesMinutes(apartment);
    if (
      everyday !== undefined &&
      this.profile.topPriorities.some((p) => ['EverydayServicesNearby', 'SupermarketNearby', 'PharmacyNearby'].includes(p))
    ) {
      const round = (value: number) => Math.round(value * 10) / 10;
      const parts = [
        apartment.groceryDistanceMinutes != null ? `Supermarket ${apartment.groceryDistanceMinutes} min` : '',
        apartment.pharmacyDistanceMinutes != null ? `Pharmacy ${apartment.pharmacyDistanceMinutes} min` : '',
      ].filter(Boolean);
      add(`Everyday services ${round(everyday)} min on average`, parts.join(' · '), 'fa-basket-shopping');
    }
    const parkingCondition = apartment.parkingCondition?.trim().toLowerCase();
    if (
      drives &&
      (apartment.hasParking === true ||
        (!!parkingCondition && !['no', 'none', 'not available', 'false'].includes(parkingCondition)))
    ) {
      // Paid parking must never read as "included".
      const parking = parseParkingCost(apartment.description || '');
      if (parking.cost === 'Paid') {
        const price = parking.price != null
          ? `${parking.currency === 'GEL' ? '₾' : '$'}${parking.price.toLocaleString('en-US')}`
          : '';
        add('Paid parking', price ? `+${price}` :'Parking is available for a fee', 'fa-square-parking');
      } else {
        add('Parking included', 'Because you travel by car', 'fa-square-parking');
      }
    }
    if (
      lifestyles.has('HostsGuests') &&
      apartment.bedrooms != null &&
      apartment.bedrooms >= 2
    ) {
      add('Extra bedroom', 'Because you often host guests', 'fa-bed');
    }
    if (this.profile.hasPet && apartment.isPetFriendly) {
      add('Pet-friendly home', `Because you live with ${this.profile.petType === 'Cat' ? 'a cat' : 'a pet'}`, 'fa-paw');
    }
    if (apartment.metroDistanceMinutes != null && this.profile.transportation.includes('Metro')) {
      add(
        `Metro ${apartment.metroDistanceMinutes} min away`,
        'Because metro is part of your routine',
        'fa-train-subway',
      );
    }
    if (
      !hasDog &&
      apartment.parkDistanceMinutes != null &&
      (lifestyles.has('Athlete') || lifestyles.has('FamilyFocused'))
    ) {
      add(
        `Park ${apartment.parkDistanceMinutes} min away`,
        lifestyles.has('Athlete') ? 'Because you enjoy an active lifestyle' : 'Because outdoor family time matters to you',
        'fa-tree',
      );
    }

    return insights.slice(0, 6);
  }
}
