import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { HomeMatchResult } from '../models/home-match-result';
import { explainHomeMatch, petsConfirmed, type LifestyleInsight } from '../services/match-explanations';
import { MatchFit } from '../match-fit/match-fit';
import { toMediaUrl } from '../../utils/api-media';
import { HomeMatchProfile } from '../models/home-match-profile';
import {
  applyPriorityScoring,
  everydayServicesMinutes,
} from '../services/priority-scoring';
import { answerLabel, answerList, bedroomsLabel } from '../services/answer-labels';
import {
  evaluateMandatoryRequirements,
  petListLabel,
  compareMatchOrder,
  selectedPets,
} from '../services/mandatory-requirements';
import { CurrencyService } from '../../services/currency.service';
import { ApartmentService } from '../../services/apartment.service';
import { parseParkingCost } from '../../utils/parking-cost';
import { listedUniversityMinutes } from '../../utils/universities';
import { NgIf, NgFor, NgClass, NgTemplateOutlet } from '@angular/common';
import { VelvenLifestyleAvatarComponent } from '../lifestyle-avatar/lifestyle-avatar.component';
import { Router, RouterLink } from '@angular/router';
import { FavoriteService } from '../../services/favorite.service';
import { AuthService } from '../../services/auth.service';
import { rememberResultsUrl } from '../../utils/results-return';
import { HomeMatchService } from '../services/home-match.service';
import { CurrencyPrice } from '../../currency-price/currency-price';
import { GooglePropertyMapComponent } from '../../maps/google-property-map/google-property-map.component';
import { ListingTitlePipe } from '../../shared/listing-title.pipe';
import { PhotoUrlPipe } from '../../shared/photo-url.pipe';
import { districtIcon } from '../../utils/district-icons';
import { PhotoDotsComponent } from '../../shared/photo-dots/photo-dots.component';

/** Whether the finished search was kept in the client's Velven Discover. */
export type SearchSaveState = 'saving' | 'saved' | 'updated' | 'duplicate' | 'failed' | 'guest' | null;

@Component({
  selector: 'app-home-match-results',
  templateUrl: './home-match-results.component.html',
  styleUrl: './home-match-results.component.css',
  imports: [PhotoDotsComponent, PhotoUrlPipe, 
    NgIf,
    VelvenLifestyleAvatarComponent,
    RouterLink,
    NgFor,
    NgClass,
    CurrencyPrice,
    GooglePropertyMapComponent,
    NgTemplateOutlet,
    ListingTitlePipe,
    MatchFit,
  ],
})
export class HomeMatchResultsComponent implements OnChanges {
  /** District picture next to the map, same style as the area pickers. */
  readonly districtIcon = districtIcon;

  @Input() matches: HomeMatchResult[] = [];
  @Input({ required: true }) profile!: HomeMatchProfile;
  @Output() edit = new EventEmitter<void>();
  /** "Reset preferences": clear every answer and start Velven Match again. */
  @Output() reset = new EventEmitter<void>();
  /** Second tap confirms the reset. */
  confirmReset = false;
  /** Emits the question step whose answer the user wants to change from the results. */
  @Output() changeAnswer = new EventEmitter<number>();
  @Input() saveState: SearchSaveState = null;
  @Input() savedSearchName = '';
  @Input() savedSearchId: number | null = null;
  /** Visitor wants to save the search: true = create an account, false = sign in. */
  @Output() saveAsGuest = new EventEmitter<boolean>();
  @Output() retrySave = new EventEmitter<void>();

  get saveIcon(): string {
    if (this.saveState === 'guest') return 'fa-bell';
    if (this.saveState === 'saving') return 'fa-spinner fa-spin';
    if (this.saveState === 'failed') return 'fa-triangle-exclamation';
    return 'fa-circle-check';
  }

  /** The main answers, shown above the results so each can be changed in one tap. */
  /** Chips are rebuilt on every change detection; a stable key keeps their buttons (and clicks). */
  trackChip(_: number, chip: { step: number; label: string }): string {
    return `${chip.step}:${chip.label}`;
  }

  get answerChips(): Array<{ step: number; label: string; value: string; icon: string }> {
    const p = this.profile;
    const rent = p.propertyGoal !== 'Buy';
    const location = p.locationFlexible
      ? 'Flexible'
      : p.districts.length
        ? answerList(p.districts)
        : p.selectedMapArea
          ? 'Selected map area'
          : '';
    const chips = [
      location ? { step: 2, label: 'Location', value: location, icon: 'fa-location-dot' } : null,
      rent
        ? {
            step: 3,
            label: 'Budget',
            value: `${p.currency} ${p.budgetMin.toLocaleString()}–${p.budgetMax.toLocaleString()}`,
            icon: 'fa-wallet',
          }
        : null,
      p.bedrooms !== undefined
        ? { step: 6, label: 'Bedrooms', value: bedroomsLabel(p), icon: 'fa-bed' }
        : null,
      p.lifestyles.length
        ? { step: 9, label: 'Lifestyle', value: answerList(p.lifestyles), icon: 'fa-heart' }
        : null,
      p.transportation.length
        ? { step: 8, label: 'Transport', value: answerList(p.transportation), icon: 'fa-route' }
        : null,
      p.topPriorities.length
        ? {
            step: 11,
            label: 'Top 5 priorities',
            // " · ", not ", ": one priority itself contains a comma, which kept the list untranslated.
            value: p.topPriorities.map(answerLabel).join(' · '),
            icon: 'fa-list-ol',
          }
        : null,
    ];
    return chips.filter((chip): chip is NonNullable<typeof chip> => !!chip);
  }
  readonly enrichingApartmentIds = new Set<number>();
  private readonly failedImageIndexes = new WeakMap<HTMLImageElement, number>();
  private readonly attemptedEnrichment = new WeakSet<HomeMatchResult>();

  constructor(
    private readonly apartmentService: ApartmentService,
    private readonly cdr: ChangeDetectorRef,
    private readonly currency: CurrencyService,
    private readonly homeMatch: HomeMatchService,
    public readonly favorites: FavoriteService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  readonly dismissedIds = new Set<number>();
  readonly expandedMatches = new Set<number>();
  toggleMatchDetails(result: HomeMatchResult): void {
    const id = result.apartment.id;
    this.expandedMatches.has(id) ? this.expandedMatches.delete(id) : this.expandedMatches.add(id);
  }
  saveFavorite(result: HomeMatchResult): void {
    if (!this.auth.isLoggedIn) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.favorites.toggleFavorite(result.apartment.id).subscribe({ error: () => this.cdr.markForCheck() });
  }
  parkingLabel(result: HomeMatchResult): string {
    const parking = parseParkingCost(result.apartment.description || '');
    if (parking.cost === 'Free') return 'Free';
    if (parking.cost === 'Paid') return 'Paid';
    return result.apartment.hasParking ? 'Available' : '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['matches']) {
      this.favorites.loadFavorites().subscribe({ error: () => {} });
      this.matches.forEach((result) => {
        Object.assign(result, applyPriorityScoring(result, this.profile));
        result.requirement = evaluateMandatoryRequirements(
          result.apartment,
          this.profile,
          this.currency.rates,
        );
        if (!this.imageCandidates(result).length) this.enrichApartment(result);
      });
    }
  }
  /** Homes that fail a mandatory requirement stay hidden until the user asks for alternatives. */
  showAlternatives = false;

  private byStatus(status: 'exact' | 'confirm' | 'alternative'): HomeMatchResult[] {
    return this.matches
      .filter((result) => (result.requirement?.status ?? 'exact') === status)
      .sort(
        (a, b) =>
          Number((a.requirement?.overBudgetUsd ?? 0) > 0) -
            Number((b.requirement?.overBudgetUsd ?? 0) > 0) ||
          (b.rankingScore ?? b.matchScore) - (a.rankingScore ?? a.matchScore),
      );
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
  /** Same eligible set as Discover, ordered by preference fit inside each pet-policy group. */
  get rankedMatches(): HomeMatchResult[] {
    return this.matches.filter(result => result.requirement?.status !== 'alternative')
      .sort((a, b) => compareMatchOrder(
        { status: a.requirement?.status, apartment: a.apartment, score: a.rankingScore ?? a.matchScore },
        { status: b.requirement?.status, apartment: b.apartment, score: b.rankingScore ?? b.matchScore },
        this.profile,
      ));
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
    const clean = (sources: Array<string | undefined>) => [
      ...new Set(
        sources.map((source) => toMediaUrl(source)).filter((source): source is string => !!source),
      ),
    ];
    const seen = new Set<string>();
    const slides = [
      ...ordered.map((item) => clean([item.url, item.storagePath])),
      ...(apartment.imageUrls || []).map((url) => clean([url])),
      clean([apartment.imageUrl]),
    ].filter(
      (sources) =>
        sources.length &&
        !sources.some((source) => seen.has(source)) &&
        (sources.forEach((s) => seen.add(s)), true),
    );
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
    if (this.galleryIndex.get(result.apartment.id) !== index)
      this.galleryIndex.set(result.apartment.id, index);
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
    if (
      !Number.isFinite(apartmentId) ||
      this.enrichingApartmentIds.has(apartmentId) ||
      this.attemptedEnrichment.has(result)
    ) {
      if (image) this.showPlaceholder(image);
      return;
    }

    this.attemptedEnrichment.add(result);
    this.enrichingApartmentIds.add(apartmentId);
    this.apartmentService
      .getApartment(apartmentId)
      .pipe(
        timeout(15000),
        finalize(() => {
          this.enrichingApartmentIds.delete(apartmentId);
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
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
  private readonly walkingCache = new Map<
    HomeMatchResult['apartment'],
    Array<{ label: string; minutes: number; icon: string }>
  >();

  answerMatches(result: HomeMatchResult): LifestyleInsight[] {
    const apartment = result.apartment;
    const cached = this.answerMatchCache.get(apartment);
    if (cached) return cached;
    const rates = this.currency.rates;
    const requirement = result.requirement ?? evaluateMandatoryRequirements(apartment, this.profile, rates);
    const items = explainHomeMatch(apartment, this.profile, rates, requirement);
    this.answerMatchCache.set(apartment, items);
    return items;
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
      ['University', listedUniversityMinutes(apartment), 'fa-graduation-cap'],
      ['EV charger', apartment.evChargerDistanceMinutes, 'fa-charging-station'],
      ['Pet shop', apartment.petStoreDistanceMinutes, 'fa-paw'],
      ['Vet clinic', apartment.veterinaryDistanceMinutes, 'fa-stethoscope'],
    ];
    // Only genuinely walkable places: 10 minutes or less. Pet owners also see the nearest
    // pet shop and vet up to 20 minutes, and students the nearest university, since those
    // are fewer and farther apart.
    const hasPets = this.profile.propertyGoal === 'Rent' && selectedPets(this.profile).length > 0;
    const student =
      this.profile.lifestyles.includes('Student') ||
      this.profile.topPriorities.includes('UniversityNearby');
    const hasKids = this.profile.children > 0;
    const limit = (label: string) =>
      (hasPets && (label === 'Pet shop' || label === 'Vet clinic')) ||
      (student && label === 'University')
        ? 20
        : 10;
    // Schools and kindergartens only matter to households with children.
    const relevant = (label: string) => hasKids || (label !== 'School' && label !== 'Kindergarten');
    // What this visitor asked for comes first, then everything else by distance.
    const first = (label: string) => (student && label === 'University' ? 0 : 1);
    const value = places
      .filter(
        (place): place is [string, number, string] =>
          typeof place[1] === 'number' &&
          place[1] >= 0 &&
          place[1] <= limit(place[0]) &&
          relevant(place[0]),
      )
      .map(([label, minutes, icon]) => ({ label, minutes: Math.round(minutes), icon }))
      .sort((a, b) => first(a.label) - first(b.label) || a.minutes - b.minutes);
    if (!value.length) {
      // Match results can arrive without walking data; load the full listing once, then rebuild.
      queueMicrotask(() => this.enrichApartment(result));
      return value;
    }
    this.walkingCache.set(apartment, value);
    return value;
  }

  /** Cached per apartment: a fresh array each change-detection pass would rebuild the DOM (and re-run translation). */
  private readonly homeDetailsCache = new Map<
    HomeMatchResult['apartment'],
    Array<{ label: string; value: string; icon: string }>
  >();

  homeDetails(result: HomeMatchResult): Array<{ label: string; value: string; icon: string }> {
    const apartment = result.apartment;
    const cached = this.homeDetailsCache.get(apartment);
    if (cached) return cached;
    const details: Array<{ label: string; value: string; icon: string }> = [];
    if (apartment.sizeSquareMeters)
      details.push({
        label: 'Area',
        value: `${apartment.sizeSquareMeters} m²`,
        icon: 'fa-ruler-combined',
      });
    if (apartment.floor != null) {
      details.push({
        label: 'Floor',
        value: apartment.totalFloors
          ? `${apartment.floor} / ${apartment.totalFloors}`
          : `${apartment.floor}`,
        icon: 'fa-stairs',
      });
    }
    if (apartment.bathrooms)
      details.push({ label: 'Bathrooms', value: `${apartment.bathrooms}`, icon: 'fa-bath' });
    if (this.profile?.propertyGoal !== 'Buy') {
      const available = apartment.availableFrom?.slice(0, 10);
      details.push({
        label: 'Move-in',
        value:
          available && available > new Date().toISOString().slice(0, 10)
            ? available
            : 'Available now',
        icon: 'fa-calendar-check',
      });
      const minimum = /(\d+)\s*month/i.exec(apartment.minimumRentalPeriod || '')?.[1];
      if (minimum)
        details.push({
          label: 'Minimum stay',
          value: `${minimum} months`,
          icon: 'fa-hourglass-half',
        });
    }
    const parking = parseParkingCost(apartment.description || '');
    if (parking.cost === 'Paid') {
      // Kept as separate strings so the page translator can match "Paid parking" / "Paid".
      const price =
        parking.price != null
          ? `+${parking.currency === 'GEL' ? '₾' : '$'}${parking.price.toLocaleString('en-US')}`
          : 'Paid';
      details.push({ label: 'Paid parking', value: price, icon: 'fa-square-parking' });
    } else if (apartment.hasParking) {
      details.push({
        label: 'Parking',
        value: parking.cost === 'Free' ? 'Free' : 'Available',
        icon: 'fa-square-parking',
      });
    }
    if (apartment.isFurnished != null)
      details.push({
        label: 'Furniture',
        value: apartment.isFurnished ? 'Furnished' : 'Unfurnished',
        icon: 'fa-couch',
      });
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
      relevantTimes.push(apartment.schoolDistanceMinutes, apartment.kindergartenDistanceMinutes);
    }
    return relevantTimes.some((value) => value !== undefined && value !== null);
  }

  isFamilyProfile(): boolean {
    return this.profile.children > 0 || this.profile.householdType === 'FamilyWithChildren';
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
    const hasDog = selectedPets(this.profile).includes('Dog') && petsConfirmed(result.apartment, this.profile);

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

    if (
      apartment.kindergartenDistanceMinutes != null &&
      (childAges.has('Age0To3') || childAges.has('Age4To6'))
    ) {
      add(
        `Kindergarten ${apartment.kindergartenDistanceMinutes} min away`,
        childAges.has('Age4To6')
          ? 'Because you have a 4–6-year-old child'
          : 'Because you have a young child',
        'fa-shapes',
      );
    }
    if (
      apartment.schoolDistanceMinutes != null &&
      (childAges.has('Age7To12') || childAges.has('Age13To17'))
    ) {
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
      this.profile.topPriorities.some((p) =>
        ['EverydayServicesNearby', 'SupermarketNearby', 'PharmacyNearby'].includes(p),
      )
    ) {
      const round = (value: number) => Math.round(value * 10) / 10;
      const parts = [
        apartment.groceryDistanceMinutes != null
          ? `Supermarket ${apartment.groceryDistanceMinutes} min`
          : '',
        apartment.pharmacyDistanceMinutes != null
          ? `Pharmacy ${apartment.pharmacyDistanceMinutes} min`
          : '',
      ].filter(Boolean);
      add(
        `Everyday services ${round(everyday)} min on average`,
        parts.join(' · '),
        'fa-basket-shopping',
      );
    }
    const parkingCondition = apartment.parkingCondition?.trim().toLowerCase();
    if (
      drives &&
      (apartment.hasParking === true ||
        (!!parkingCondition &&
          !['no', 'none', 'not available', 'false'].includes(parkingCondition)))
    ) {
      // Paid parking must never read as "included".
      const parking = parseParkingCost(apartment.description || '');
      if (parking.cost === 'Paid') {
        const price =
          parking.price != null
            ? `${parking.currency === 'GEL' ? '₾' : '$'}${parking.price.toLocaleString('en-US')}`
            : '';
        add(
          'Paid parking',
          price ? `+${price}` : 'Parking is available for a fee',
          'fa-square-parking',
        );
      } else {
        add('Parking included', 'Because you travel by car', 'fa-square-parking');
      }
    }
    if (lifestyles.has('HostsGuests') && apartment.bedrooms != null && apartment.bedrooms >= 2) {
      add('Extra bedroom', 'Because you often host guests', 'fa-bed');
    }
    if (petsConfirmed(result.apartment, this.profile)) {
      add(
        'Pet-friendly home',
        `Because you live with your ${petListLabel(selectedPets(this.profile))}`,
        'fa-paw',
      );
    }
    if (
      apartment.metroDistanceMinutes != null &&
      apartment.metroDistanceMinutes <= 20 &&
      this.profile.transportation.includes('Metro')
    ) {
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
        lifestyles.has('Athlete')
          ? 'Because you enjoy an active lifestyle'
          : 'Because outdoor family time matters to you',
        'fa-tree',
      );
    }

    return insights.slice(0, 6);
  }

  /** The apartment page's "Back to results" then returns here, to the same Velven Match results. */
  rememberMatchResults(): void {
    rememberResultsUrl('/ai-home-match');
    // Saved now: by the time this page is destroyed the router has already scrolled to the top.
    this.homeMatch.saveResultsScroll(window.scrollY);
  }
}
