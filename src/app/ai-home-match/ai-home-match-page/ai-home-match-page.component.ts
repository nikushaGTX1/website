import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import {
  FormControl,
  FormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { catchError, finalize, of, Subscription, switchMap } from 'rxjs';
import { HomeMatchResult } from '../models/home-match-result';
import { HomeMatchOption, HomeMatchQuestion } from '../models/home-match-question';
import { EMPTY_HOME_MATCH_PROFILE, HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchService } from '../services/home-match.service';
import { GeoJsonPolygon } from '../../services/apartment.service';
import { ApiLocation } from '../../models/location';
import { LocationService } from '../../services/location.service';
import { preloadImages } from '../../utils/api-media';
import {
  answerLabel,
  answerList,
  isPastDate,
  selectedBedrooms,
  todayIso,
} from '../services/answer-labels';
import { selectedPets } from '../services/mandatory-requirements';
import { DogSize, PetKind } from '../models/home-match-profile';
import { NgIf, NgFor, NgSwitch, NgSwitchCase, DecimalPipe } from '@angular/common';
import { DatePickerComponent } from '../../shared/date-picker/date-picker.component';
import { VelvenLifestyleAvatarComponent } from '../lifestyle-avatar/lifestyle-avatar.component';
import { HomeProfileSummaryComponent } from '../home-profile-summary/home-profile-summary.component';
import { HomeMatchResultsComponent } from '../home-match-results/home-match-results.component';
import { DrawAreaMapComponent } from '../../maps/draw-area-map/draw-area-map.component';
import { ActivatedRoute, Router } from '@angular/router';
import { enableFlagEmojis } from '../../utils/flag-emoji';
import { AuthService } from '../../services/auth.service';
import { ClientService } from '../../services/client.service';
import { CountryOption, countryOptions, fold, localizedCountryName } from '../../utils/country-names';
import { TranslationService } from '../../services/translation.service';
import { SearchSaveState } from '../home-match-results/home-match-results.component';
import { ClientBoardService, IntakeContact } from '../../services/client-board.service';
import { isValidPhone } from '../../utils/phone';

// Windows has no flag emoji: the nationality step loads the site's flag font.
enableFlagEmojis();

type ViewState = 'questions' | 'review' | 'intake' | 'loading' | 'results' | 'error';
@Component({
  selector: 'app-ai-home-match-page',
  templateUrl: './ai-home-match-page.component.html',
  styleUrl: './ai-home-match-page.component.css',
  imports: [
    NgIf,
    NgFor,
    NgSwitch,
    NgSwitchCase,
    FormsModule,
    ReactiveFormsModule,
    DatePickerComponent,
    VelvenLifestyleAvatarComponent,
    HomeProfileSummaryComponent,
    HomeMatchResultsComponent,
    DrawAreaMapComponent,
    DecimalPipe,
  ],
})
export class AiHomeMatchPageComponent implements OnDestroy {
  private intakeToken: string | null = null;
  private intakeSavedProfile = '';
  private intakeRequest?: Subscription;
  intakeContact: IntakeContact = {
    firstName: '', phone: '', nationality: '', consent: false, publishConsent: false,
  };
  intakeBusy = false;
  /** Nationality from the signed-in account; when set, the nationality question is skipped. */
  private accountNationality = '';

  /** Nationality saved at sign-up: fill it in and leave the nationality question if it is open. */
  private applyAccountNationality(nationality: string | null | undefined): void {
    if (!nationality) return;
    this.accountNationality = nationality;
    this.profile.nationality = nationality;
    this.persist();
    if (this.view === 'questions' && this.step === 14) {
      this.step = this.firstIncompleteStep() ?? this.visibleSteps[0] ?? this.step;
    }
    this.cdr.markForCheck();
  }
  intakeError = '';
  readonly phaseLabels = [
    'Lifestyle',
    'Location',
    'Home Details',
    'Preferences',
    'Budget',
    'Review',
  ];
  readonly questions: HomeMatchQuestion[] = [
    { title: 'Choose your character' },
    { title: 'What are you looking for?' },
    { title: 'Where would you like to live?', subtitle: 'Choose one or more locations.' },
    { title: 'What is your budget?' },
    { title: 'Who will be living in the apartment?' },
    { title: 'How many people will live in the apartment?' },
    { title: 'How many bedrooms do you need?' },
    { title: 'Your timing' },
    { title: 'How do you usually get around?' },
    { title: 'Which options best describe your lifestyle?', subtitle: 'Choose up to 3 options.' },
    {
      title: 'Do you have a pet?',
      subtitle: 'Some apartments have special conditions regarding pets.',
    },
    {
      title: 'Rank your Top 5 priorities',
      subtitle: 'Choose them in order from most to least important.',
    },
    { title: 'What style of apartment do you like?' },
    { title: 'What condition should the property be in?', subtitle: 'Choose one or more.' },
    { title: 'What is your nationality?', subtitle: 'Choose the country whose nationality you hold.' },
  ];
  /**
   * Countries shown first. Every other country follows alphabetically, and the search
   * matches names in English, Georgian and Russian as well as the country code.
   */
  private static readonly popularNationalities = [
    'GE', 'RU', 'UA', 'BY', 'AM', 'AZ', 'KZ', 'UZ', 'KG', 'TJ', 'TM', 'MD',
    'TR', 'IR', 'IL', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'JO', 'LB', 'IQ', 'EG',
    'IN', 'PK', 'BD', 'LK', 'NP',
    'CN', 'JP', 'KR', 'PH', 'VN', 'TH', 'ID', 'MY', 'SG',
    'US', 'CA', 'GB', 'IE', 'AU', 'NZ',
    'DE', 'FR', 'IT', 'ES', 'PT', 'NL', 'BE', 'CH', 'AT', 'PL', 'CZ', 'SK', 'HU',
    'RO', 'BG', 'GR', 'CY', 'RS', 'HR', 'SI', 'BA', 'MK', 'AL', 'EE', 'LV', 'LT',
    'FI', 'SE', 'NO', 'DK', 'IS',
    'BR', 'AR', 'MX', 'CL', 'CO', 'PE', 'ZA', 'NG', 'KE',
  ];
  nationalitySearch = '';
  get allNationalities(): CountryOption[] {
    return countryOptions(this.translation.language$.value);
  }
  get nationalityOptions(): CountryOption[] {
    const all = this.allNationalities;
    const query = fold(this.nationalitySearch.trim());
    if (query) return all.filter((country) => country.search.includes(query));
    // Suggested countries first, then every other country in the language's alphabetical order.
    const suggested = AiHomeMatchPageComponent.popularNationalities
      .map((code) => all.find((country) => country.code === code))
      .filter((country): country is CountryOption => !!country);
    const shown = new Set(suggested.map((country) => country.code));
    return [...suggested, ...all.filter((country) => !shown.has(country.code))];
  }
  chooseNationality(name: string): void {
    this.profile.nationality = name;
    this.nationalitySearch = '';
    this.persist();
  }
  /** The chosen nationality as the client sees it, in the site language. */
  get nationalityLabel(): string {
    return localizedCountryName(this.profile.nationality, this.translation.language$.value);
  }
  /** Buyers only (question 13). "Any" stands alone. */
  readonly conditionOptions = [
    { value: 'MoveInReady', label: 'Move-in ready', icon: 'fa-solid fa-couch' },
    { value: 'Renovated', label: 'Renovated', icon: 'fa-solid fa-paint-roller' },
    { value: 'WhiteFrame', label: 'White frame', icon: 'fa-regular fa-square' },
    { value: 'BlackFrame', label: 'Black frame', icon: 'fa-solid fa-square' },
    { value: 'GreenFrame', label: 'Green frame', icon: 'fa-solid fa-seedling' },
    { value: 'NeedsRenovation', label: 'Needs renovation', icon: 'fa-solid fa-trowel-bricks' },
    { value: 'Any', label: 'Any condition', icon: 'fa-solid fa-check-double' },
  ];
  toggleCondition(value: string): void {
    const current = this.profile.propertyConditions ?? [];
    this.profile.propertyConditions = value === 'Any'
      ? (current.includes('Any') ? [] : ['Any'])
      : current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current.filter((item) => item !== 'Any'), value];
    this.persist();
  }
  conditionSelected(value: string): boolean {
    return (this.profile.propertyConditions ?? []).includes(value);
  }
  /** Same popular-area cards as the location picker on the main page. */
  readonly featuredDistricts = [
    { value: 'Vake', description: 'Premium central area', icon: '/icons/areas/vake-tree.svg' },
    {
      value: 'Saburtalo',
      description: 'Central & convenient',
      icon: '/icons/areas/saburtalo-buildings.svg',
    },
    { value: 'Vera', description: 'Historic central', icon: '/icons/areas/vera-heritage-house.svg' },
    {
      value: 'Mtatsminda',
      description: 'Old city & views',
      icon: '/icons/areas/mtatsminda-columns.svg',
    },
  ];
  readonly otherDistricts = this.opts(
    [
      'Dighomi',
      'Didi Dighomi',
      'Didube',
      'Avlabari',
      'Isani',
      'Gldani',
      'Chugureti',
      'Ortachala',
      'Nadzaladevi',
      'Krtsanisi',
      'Vashlijvari',
      'Sololaki',
      'Samgori',
    ],
    [
      'Dighomi',
      'DidiDighomi',
      'Didube',
      'Avlabari',
      'Isani',
      'Gldani',
      'Chugureti',
      'Ortachala',
      'Nadzaladevi',
      'Krtsanisi',
      'Vashlijvari',
      'Sololaki',
      'Samgori',
    ],
  );
  readonly household = this.opts(
    ['Just me', 'Couple', 'Family with children', 'Relatives', 'Roommates', 'Company employees'],
    ['JustMe', 'Couple', 'FamilyWithChildren', 'Relatives', 'Roommates', 'CorporateHousing'],
  );
  readonly lifestyles = this.opts(
    [
      'Active and athletic',
      'I work from home',
      'Business professional',
      'Student',
      'Quiet lifestyle',
      'Social and active lifestyle',
      'I often host guests',
    ],
    [
      'Athlete',
      'RemoteWorker',
      'BusinessProfessional',
      'Student',
      'QuietLifestyle',
      'SocialLifestyle',
      'HostsGuests',
    ],
  );
  readonly transport = this.opts(
    ['Car', 'Metro', 'Walking', 'Multiple methods'],
    ['Car', 'Metro', 'Walking', 'MultipleMethods'],
  );
  readonly answerLabel = answerLabel;
  readonly answerList = answerList;
  /** Earliest selectable specific move-in date. */
  get today(): string {
    return todayIso();
  }
  get moveInDateInPast(): boolean {
    return this.profile.moveInTiming === 'SpecificDate' && isPastDate(this.profile.moveInDate);
  }
  profile: HomeMatchProfile;
  quizStarted = false;
  step = 1;
  mapVisible = false;
  pendingMapArea = '';
  locationEntries: ApiLocation[] = [];
  locationsLoaded = false;
  proximitySuggestOpen = false;
  // The map always opens clean (no pre-drawn district boundaries) so the
  // user draws the area manually with the DRAW button, like on Main.
  // Must stay a stable reference: a fresh [] each CD cycle would look like
  // an input change and wipe an in-progress drawing.
  readonly noPreselectedMapAreas: string[] = [];
  get fixedHousehold(): boolean {
    return ['JustMe', 'Couple'].includes(this.profile.householdType);
  }
  selectDistrict(value: string): void {
    if (value === 'SelectOnMap') {
      this.pendingMapArea = '';
      this.mapVisible = true;
    } else this.toggle('districts', value);
  }
  applyMap(polygon: GeoJsonPolygon): void {
    this.profile.selectedMapArea = polygon;
    const points = polygon.coordinates[0].slice(0, -1);
    if (points.length) {
      this.profile.proximityLongitude = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      this.profile.proximityLatitude = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    }
    if (this.pendingMapArea && !this.profile.districts.includes(this.pendingMapArea))
      this.profile.districts.push(this.pendingMapArea);
    this.profile.locationFlexible = false;
    this.mapVisible = false;
    this.persist();
  }
  view: ViewState = 'questions';
  matches: HomeMatchResult[] = [];
  errorMessage = '';
  saveMessage = '';
  saving = false;
  loadingMessage = 'Understanding your lifestyle...';
  private loadingTimer?: number;
  budgetForm = new FormGroup({
    min: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    max: new FormControl(1000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    currency: new FormControl<'USD' | 'GEL' | 'EUR'>('USD', { nonNullable: true }),
  });

  // Same price-distribution chart and dual slider as the Explore price filter.
  readonly budgetHistogram = [
    5, 7, 6, 8, 9, 10, 12, 14, 18, 24, 31, 38, 45, 52, 48, 55, 58, 62, 57, 54, 51, 56, 53, 61, 66,
    100, 82, 63, 49, 55, 41, 30, 22, 18, 28,
  ];
  get budgetSliderMax(): number {
    return this.budgetForm.controls.currency.value === 'GEL' ? 13500 : 5000;
  }
  get budgetSliderStep(): number {
    return this.budgetForm.controls.currency.value === 'GEL' ? 100 : 50;
  }
  get budgetSymbol(): string {
    const currency = this.budgetForm.controls.currency.value;
    return currency === 'GEL' ? '₾' : currency === 'EUR' ? '€' : '$';
  }
  private budgetPercent(value: number): number {
    return Math.min(100, Math.max(0, ((Number(value) || 0) / this.budgetSliderMax) * 100));
  }
  get budgetMinPercent(): number {
    return this.budgetPercent(this.budgetForm.controls.min.value);
  }
  get budgetMaxPercent(): number {
    return this.budgetPercent(this.budgetForm.controls.max.value);
  }
  barInBudget(index: number): boolean {
    const position = (index / (this.budgetHistogram.length - 1)) * 100;
    return position >= this.budgetMinPercent && position <= this.budgetMaxPercent;
  }
  @ViewChild('budgetRange') private budgetRange?: ElementRef<HTMLElement>;

  /**
   * A click on the price chart moves a handle to that price: the left handle when the click is
   * left of the selected range, the right one when it is right of it, otherwise the nearer one.
   * Keeping the button pressed drags that handle.
   */
  pickBudgetAt(event: PointerEvent): void {
    if ((event.target as HTMLElement).tagName === 'INPUT' || !this.budgetRange) return;
    event.preventDefault();
    const priceAt = (clientX: number): number => {
      // Handles travel between the track's ends (13px in from each side, half a handle).
      const rect = this.budgetRange!.nativeElement.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left - 13) / (rect.width - 26)));
      const step = this.budgetSliderStep;
      return Math.round((ratio * this.budgetSliderMax) / step) * step;
    };
    const price = priceAt(event.clientX);
    const min = Number(this.budgetForm.controls.min.value) || 0;
    const max = Number(this.budgetForm.controls.max.value) || 0;
    const moveMin = price < min || (price <= max && price - min < max - price);
    const set = (value: number): void => (moveMin ? this.setBudgetMin(value) : this.setBudgetMax(value));
    set(price);
    const onMove = (move: PointerEvent): void => set(priceAt(move.clientX));
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  setBudgetMin(value: number | string): void {
    const max = Number(this.budgetForm.controls.max.value);
    this.budgetForm.controls.min.setValue(Math.min(max, Math.max(0, Number(value) || 0)));
  }
  setBudgetMax(value: number | string): void {
    const min = Number(this.budgetForm.controls.min.value);
    this.budgetForm.controls.max.setValue(
      Math.max(min, Math.min(this.budgetSliderMax, Number(value) || 0)),
    );
  }

  constructor(
    private service: HomeMatchService,
    private cdr: ChangeDetectorRef,
    private locationService: LocationService,
    route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private clientService: ClientService,
    private boardService: ClientBoardService,
    private translation: TranslationService,
  ) {
    // The lifestyle character's figures are fetched while the visitor reads the first
    // question, so they appear at once when the profile panel shows them.
    window.setTimeout(
      () =>
        preloadImages(
          ['adult-man', 'adult-woman', 'adult-man-two', 'adult-woman-two', 'cat', 'dog-small', 'dog-medium', 'dog-large'].map(
            (name) => `/images/ai-match/${name}.webp`,
          ),
        ),
      1500,
    );
    const query = route.snapshot.queryParamMap;
    // Short agent link (/m/nika) and the older ?intake= form both open the same flow.
    this.intakeToken = query.get('intake') || route.snapshot.paramMap.get('slug');
    // A link an agent sent: the client came to answer the questions, so open them directly
    // instead of the Velven Match intro page.
    // Agent links need an account: the client registers (with nationality) before answering.
    if (this.intakeToken && !this.auth.currentUser) {
      void this.router.navigate(['/register'], { queryParams: { returnUrl: this.router.url } });
    }
    if (this.intakeToken) {
      this.quizStarted = true;
      setTimeout(() => document.querySelector('.wizard-shell')?.scrollIntoView({ block: 'start' }), 0);
    }
    // "Find My Perfect Home" in Velven Discover starts a new search from the first question.
    if (query.get('new')) service.clearSession();
    // "Edit preferences" in Velven Discover: the saved answers are already in this tab.
    this.editSearchId = Number(query.get('editSearch')) || null;
    const restored = service.restoreFromSession();
    if (!restored) service.reset();
    this.profile = {
      ...service.profile,
      gender: service.profile.gender || '',
      adults: Math.min(7, Math.max(1, service.profile.adults || 1)),
      children: Math.min(
        Math.max(0, 7 - Math.min(7, Math.max(1, service.profile.adults || 1))),
        Math.max(0, service.profile.children || 0),
      ),
      lifestyles: (service.profile.lifestyles || []).filter(
        (lifestyle) => lifestyle !== 'FamilyFocused',
      ),
      petType:
        service.profile.petType ??
        (service.profile.hasPet === true
          ? 'Dog'
          : service.profile.hasPet === false
            ? 'None'
            : undefined),
      petCount: Math.max(1, service.profile.petCount || 1),
      topPriorities: service.profile.topPriorities || [],
    };
    // Multi-select pets; older profiles carried a single petType.
    this.profile.petTypes = this.profile.hasPet ? selectedPets(this.profile) : [];
    // Signed-in client: nationality, name and phone come from the account, not asked again.
    const user = this.auth.currentUser;
    if (user?.nationality) {
      this.accountNationality = user.nationality;
      this.profile.nationality = user.nationality;
    }
    if (user) {
      this.intakeContact.firstName ||= (user.fullName || '').trim().split(/\s+/)[0] || '';
      this.intakeContact.phone ||= user.phoneNumber || '';
      // The stored session can predate the nationality field: read it fresh from the account.
      if (!user.nationality) {
        this.auth.getProfile().subscribe({
          next: (fresh) => this.applyAccountNationality(fresh.nationality),
          error: () => undefined,
        });
      }
    }
    this.budgetForm.setValue({
      min: this.profile.budgetMin,
      max: this.profile.budgetMax,
      currency: this.profile.currency,
    });
    if (restored) {
      // Resume the saved profile: its summary when complete, else the first unanswered question.
      this.quizStarted = true;
      const missing = this.firstIncompleteStep();
      if (missing === undefined) this.view = 'review';
      else this.step = missing;
      // Back from an apartment: show the same results again instead of the summary.
      const kept = missing === undefined && this.intakeToken === null
        ? service.restoreResults(JSON.stringify(this.profile))
        : null;
      if (kept) {
        this.matches = kept.matches;
        this.view = 'results';
        // The list renders over a few frames (photos, map): retry until the page is tall enough.
        for (const delay of [60, 250, 600, 1200]) {
          setTimeout(() => {
            if (this.view === 'results' && Math.abs(window.scrollY - kept.scrollY) > 4)
              window.scrollTo({ top: kept.scrollY, behavior: 'instant' as ScrollBehavior });
          }, delay);
        }
      }
    }
    // A fresh intake link opens on the first question actually asked. It used to open on the
    // old default (property goal) and silently skip the nationality question.
    if (this.quizStarted && !restored) {
      this.step = this.firstIncompleteStep() ?? this.visibleSteps[0] ?? this.step;
    }
    this.locationService.getLocations().subscribe({
      next: (locations) => {
        this.locationEntries = locations;
        this.locationsLoaded = true;
      },
      error: () => {
        this.locationsLoaded = true;
      },
    });
  }
  ngOnDestroy(): void {
    if (this.howItWorksOpen) this.closeHowItWorks();
    this.intakeRequest?.unsubscribe();
    if (this.loadingTimer) window.clearInterval(this.loadingTimer);
  }
  get question(): HomeMatchQuestion {
    return this.questions[this.step];
  }
  get progress(): number {
    return (this.stepNumber / this.visibleSteps.length) * 100;
  }
  get visibleSteps(): number[] {
    // Question 14 (nationality) opens the flow; 12 (apartment style) follows Rent/Buy.
    // 13 (property condition) is for buyers only, right after bedrooms.
    return [14, 1, 12, 0, 2, 3, 4, 5, 6, 13, 7, 8, 9, 10, 11].filter(
      (step) =>
        !(this.profile.propertyGoal === 'Buy' && [3, 4, 5, 10].includes(step)) &&
        !(step === 13 && this.profile.propertyGoal !== 'Buy') &&
        !(step === 5 && this.fixedHousehold) &&
        // Nationality already saved on the account at sign-up.
        !(step === 14 && !!this.accountNationality),
    );
  }
  get stepNumber(): number {
    return this.visibleSteps.indexOf(this.step) + 1;
  }
  get currentPhase(): number {
    // Use the question ID as the source of truth so phase labels cannot drift.
    if (this.step === 14 || this.step === 1 || this.step === 12 || this.step === 0) return 0;
    if (this.step === 2) return 1;
    if ([4, 5, 6, 13, 7].includes(this.step)) return 2;
    if ([8, 9, 10].includes(this.step)) return 3;
    if (this.step === 3) return 4;
    if (this.step === 11) return 5;
    return 0;
  }

  selectChildAge(value: string): void {
    // Up to one age group per child. With one child a new choice replaces the old;
    // with more, a tap toggles, and once the limit is reached the oldest choice gives way.
    const max = Math.max(1, this.profile.children);
    const current = this.profile.childrenAgeGroups;
    if (current.includes(value)) {
      this.profile.childrenAgeGroups = current.filter((item) => item !== value);
    } else {
      this.profile.childrenAgeGroups = [...current, value].slice(-max);
    }
    this.persist();
  }
  get householdLabel(): string {
    if (!this.profile.householdType) return 'Tell us who will live there';
    const household = answerLabel(this.profile.householdType);
    const adults = `${this.profile.adults} adult${this.profile.adults === 1 ? '' : 's'}`;
    const children = this.profile.children
      ? `, ${this.profile.children} ${this.profile.children === 1 ? 'child' : 'children'}`
      : '';
    return `${household} · ${adults}${children}`;
  }
  get locationLabel(): string {
    return this.profile.locationFlexible
      ? 'Flexible'
      : this.profile.districts.length
        ? answerList(this.profile.districts)
        : this.profile.selectedMapArea
          ? 'Selected map area'
          : 'Not selected yet';
  }
  /** "How It Works" video window (Esc or the backdrop closes it). */
  howItWorksOpen = false;

  /** The page sits below the site header's layer, so the video window is moved to <body>. */
  @ViewChild('howVideoLayer') set howVideoLayer(layer: ElementRef<HTMLElement> | undefined) {
    if (layer && layer.nativeElement.parentElement !== document.body) document.body.appendChild(layer.nativeElement);
  }

  openHowItWorks(): void {
    this.howItWorksOpen = true;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this.closeOnEscape);
    // Phones: the video is a wide screen recording, tiny in portrait. Play it full screen
    // and turned sideways where the phone allows it; otherwise the window turns it (CSS).
    if (window.matchMedia('(max-width: 760px)').matches) {
      this.cdr.detectChanges();
      const video = document.querySelector<HTMLVideoElement & { webkitEnterFullscreen?: () => void }>(
        '.how-video video',
      );
      if (!video) return;
      const fullscreen = video.requestFullscreen?.();
      if (fullscreen) {
        fullscreen
          .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
          .catch(() => undefined);
        video.addEventListener('fullscreenchange', () => {
          if (!document.fullscreenElement) this.closeHowItWorks();
        });
      } else if (video.webkitEnterFullscreen) {
        // iPhone: its own full-screen player, which turns with the phone.
        video.webkitEnterFullscreen();
        video.addEventListener('webkitendfullscreen', () => this.closeHowItWorks(), { once: true });
      }
    }
  }

  closeHowItWorks(): void {
    if (!this.howItWorksOpen) return;
    (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    this.howItWorksOpen = false;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this.closeOnEscape);
  }

  private readonly closeOnEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.closeHowItWorks();
  };

  scrollToMatcher(): void {
    if (!this.quizStarted) {
      // Start on the first question in the current order (nationality), not the old default.
      this.step = this.firstIncompleteStep() ?? this.visibleSteps[0] ?? this.step;
    }
    this.quizStarted = true;
    document.querySelector('.wizard-shell')?.scrollIntoView({ behavior: 'smooth' });
  }
  /**
   * Keeps option buttons in place when their list is rebuilt (getters such as
   * suggestedPriorities make a new list on every check). Otherwise Angular replaced the button
   * between press and release and the click was lost.
   */
  trackOption(_index: number, item: unknown): unknown {
    if (item && typeof item === 'object') {
      const option = item as { value?: unknown; label?: unknown; name?: unknown };
      return option.value ?? option.label ?? option.name ?? item;
    }
    return item;
  }

  get suggestedPriorities(): HomeMatchOption[] {
    const rank = (value: unknown): number => {
      const index = this.profile.topPriorities.indexOf(String(value));
      return index < 0 ? Infinity : index;
    };
    return this.generateSuggestedPriorities().sort((a, b) => rank(a.value) - rank(b.value));
  }
  get currentStepIcon(): string {
    if (this.step === 14) return 'social';
    return (
      [
        'solo',
        'home',
        'location',
        'budget',
        'family',
        'family',
        'bed',
        'calendar',
        'car',
        'social',
        'pet',
        'check',
      ][this.step] || 'spark'
    );
  }
  optionIcon(value: unknown, label = ''): string {
    const raw = typeof value === 'number' ? label : (value ?? label);
    const key = String(raw)
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
    const icons: Record<string, string> = {
      selectedlocationnearby: 'location',
      workspace: 'office',
      universitynearby: 'student',
      publictransportnearby: 'bus',
      everydayservicesnearby: 'shop',
      cafesnearby: 'cafe',
      cafesorcoworkingnearby: 'cafe',
      cafesandrestaurantsnearby: 'cafe',
      meetingplacesnearby: 'cafe',
      studyspacesnearby: 'student',
      supermarketnearby: 'shop',
      pharmacynearby: 'medical',
      clinicnearby: 'medical',
      playgroundnearby: 'playground',
      playgroundorsportsfieldnearby: 'playground',
      parking: 'car',
      companyleaseavailable: 'company',
      modernmaintainedbuilding: 'company',
      quietresidentialenvironment: 'quiet',
      awayfromnightlife: 'quiet',
      citycenternearby: 'company',
      entertainmentnearby: 'social',
      balconyorterrace: 'balcony',
      rent: 'home',
      buy: 'home',
      studio: 'home',
      justme: 'solo',
      couple: 'couple',
      parentwithchildren: 'family',
      familywithchildren: 'family',
      friends: 'friends',
      relatives: 'family',
      roommates: 'friends',
      corporatehousing: 'company',
      car: 'car',
      metro: 'metro',
      walking: 'walk',
      publictransport: 'bus',
      taxi: 'taxi',
      multiplemethods: 'multi',
      athlete: 'athlete',
      remoteworker: 'laptop',
      businessprofessional: 'company',
      student: 'student',
      familyfocused: 'family',
      quietlifestyle: 'quiet',
      sociallifestyle: 'social',
      hostsguests: 'guest',
      frequenttraveler: 'multi',
      schoolnearby: 'school',
      kindergartennearby: 'school',
      parknearby: 'park',
      gymnearby: 'gym',
      metronearby: 'metro',
      balcony: 'balcony',
      naturallight: 'light',
      quietstreet: 'quiet',
      largekitchen: 'kitchen',
      separateworkspace: 'office',
      goodview: 'view',
      multiplebathrooms: 'bath',
      bedroomairconditioning: 'spark',
      securityorconcierge: 'security',
      elevator: 'elevator',
      yardorterrace: 'park',
      newbuilding: 'home',
      additionalstorage: 'storage',
      lowfloor: 'elevator',
      highfloor: 'elevator',
      largeelevator: 'elevator',
      replacefurniture: 'furniture',
      removefurniture: 'furniture',
      separatekitchen: 'kitchen',
      isolatedbedrooms: 'bed',
      companycontract: 'company',
      security24hours: 'security',
      generator: 'spark',
      waterreservoir: 'water',
      homeoffice: 'office',
      guestroom: 'guest',
      both: 'multi',
      no: 'no',
      true: 'check',
      false: 'no',
      immediately: 'calendar',
      specificdate: 'calendar',
      flexible: 'calendar',
      exploring: 'ai',
      unknown: 'ai',
      selectonmap: 'location',
      otherdistrict: 'location',
      other: 'spark',
    };
    if (icons[key]) return icons[key];
    if (/bedroom|age/.test(key)) return 'bed';
    if (/month|week|date|year/.test(key)) return 'calendar';
    if (/minute/.test(key)) return 'metro';
    if (/location|district|vake|saburtalo|vera|mtatsminda|dighomi|isani|ortachala/.test(key))
      return 'location';
    if (/office/.test(key)) return 'office';
    if (/guest/.test(key)) return 'guest';
    if (/ai|decide|matter/.test(key)) return 'ai';
    return 'spark';
  }
  proximityTargetLabel(value: string): string {
    const labels: Record<string, string> = {
      FamilyMemberWorkplace: "Family member's workplace",
      SpecificAddress: 'Specific address',
    };
    return labels[value] ?? value;
  }

  get proximityQuery(): string {
    return (this.profile.proximityAddress || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  }

  get proximitySuggestions(): Array<{
    id: number;
    label: string;
    value: string;
    district: string;
  }> {
    if (this.proximityQuery.length < 2 || !this.locationEntries.length) return [];
    const seen = new Set<number>();
    const suggestions: Array<{ id: number; label: string; value: string; district: string }> = [];
    for (const entry of this.locationEntries.filter((item) => item.city === 'Tbilisi')) {
      for (const language of ['ka', 'en'] as const) {
        for (const street of this.locationService.streetNames(entry, language)) {
          if (!street.id || seen.has(street.id)) continue;
          if (
            street.label.toLocaleLowerCase().includes(this.proximityQuery) ||
            street.value.toLocaleLowerCase().includes(this.proximityQuery)
          ) {
            seen.add(street.id);
            suggestions.push({
              id: street.id,
              label: street.label,
              value: street.value,
              district: this.locationService.districtName(entry, language),
            });
            if (suggestions.length >= 6) return suggestions;
          }
        }
      }
    }
    return suggestions;
  }

  get showProximityNoResults(): boolean {
    return (
      this.proximitySuggestOpen &&
      this.locationsLoaded &&
      this.proximityQuery.length >= 2 &&
      this.proximitySuggestions.length === 0
    );
  }

  onProximityAddressInput(): void {
    // A custom typed address has no verified coordinates until a suggestion is picked.
    this.profile.proximityLatitude = undefined;
    this.profile.proximityLongitude = undefined;
    this.proximitySuggestOpen = true;
    this.persist();
  }

  onProximityAddressBlur(): void {
    window.setTimeout(() => {
      this.proximitySuggestOpen = false;
    }, 150);
  }

  selectProximitySuggestion(suggestion: { id: number; label: string; value: string }): void {
    this.profile.proximityAddress = suggestion.label;
    this.proximitySuggestOpen = false;
    this.persist();
    this.locationService.getStreet(suggestion.id).subscribe({
      next: (record) => {
        const geometry = record.geometry;
        const path =
          geometry?.type === 'LineString'
            ? (geometry.coordinates as number[][])
            : geometry?.type === 'MultiLineString'
              ? (geometry.coordinates as number[][][])[0]
              : undefined;
        if (path?.length) {
          const middle = path[Math.floor(path.length / 2)];
          this.profile.proximityLongitude = middle[0];
          this.profile.proximityLatitude = middle[1];
        }
        this.persist();
      },
      error: () => undefined,
    });
  }
  /**
   * Option lists written in the template. The same list object is returned on every check:
   * a new list each time made Angular replace the buttons between press and release, so
   * clicks were lost.
   */
  // Created on first use: field initializers above this one already call opts().
  private optionLists?: Map<string, HomeMatchOption[]>;
  opts(labels: string[], values?: string[]): HomeMatchOption[] {
    const key = JSON.stringify([labels, values ?? []]);
    this.optionLists ??= new Map();
    let list = this.optionLists.get(key);
    if (!list) {
      list = labels.map((label, index) => ({ label, value: values?.[index] || label }));
      this.optionLists.set(key, list);
    }
    return list;
  }
  chooseCarFuel(value: 'Electric' | 'Fuel'): void {
    this.profile.carFuelType = value;
    this.persist();
  }
  /** Question 2: Rent or Buy first; the type of home is asked right below, in the same question. */
  pickGoal(goal: 'Rent' | 'Buy'): void {
    if (this.profile.propertyGoal === goal) return;
    this.choose('propertyGoal', goal);
    // A new goal asks the follow-up again ("rent" or "buy" wording).
    this.profile.homeType = '';
    this.profile.homeTypes = [];
    this.persist();
  }

  /** Apartment, private house or both: each card toggles. */
  pickHomeType(type: 'Apartment' | 'House'): void {
    const current = this.profile.homeTypes ?? [];
    const next = current.includes(type) ? current.filter((value) => value !== type) : [...current, type];
    this.profile.homeTypes = next;
    // Kept for older code and the API: set only when exactly one type is chosen.
    this.profile.homeType = next.length === 1 ? next[0] : '';
    this.persist();
  }

  isHomeTypeSelected(type: 'Apartment' | 'House'): boolean {
    return (this.profile.homeTypes ?? []).includes(type) || (!this.profile.homeTypes?.length && this.profile.homeType === type);
  }

  choose(
    key:
      | 'propertyGoal'
      | 'homeType'
      | 'gender'
      | 'householdType'
      | 'rentalDuration'
      | 'moveInTiming'
      | 'purchaseTiming'
      | 'proximityTarget'
      | 'apartmentStyle',
    value: string,
  ): void {
    (this.profile as Record<typeof key, string | undefined>)[key] = value;
    if (key === 'proximityTarget') this.proximitySuggestOpen = false;
    if (key === 'propertyGoal') {
      for (const step of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) this.clearStep(step);
      if (value === 'Buy') {
        this.profile.budgetMin = 0;
        this.profile.budgetMax = 2_000_000;
        this.profile.currency = 'USD';
        this.budgetForm.setValue({ min: 0, max: 2_000_000, currency: 'USD' });
      }
    }
    if (key === 'householdType') {
      const householdDefaults: Record<string, { adults: number; children: number }> = {
        JustMe: { adults: 1, children: 0 },
        Couple: { adults: 2, children: 0 },
        FamilyWithChildren: { adults: 2, children: 1 },
        Relatives: { adults: 3, children: 0 },
        Roommates: { adults: 2, children: 0 },
        CorporateHousing: { adults: 4, children: 0 },
      };
      const defaults = householdDefaults[value];
      if (defaults) {
        this.profile.adults = defaults.adults;
        this.profile.children = defaults.children;
        this.profile.childrenAgeGroups = [];
      }
    }
    this.persist();
  }
  toggle(
    key: 'districts' | 'childrenAgeGroups' | 'transportation' | 'lifestyles',
    value: string,
    max?: number,
  ): void {
    if (key === 'transportation') {
      const values = this.profile.transportation;
      this.profile.transportation = values.includes(value)
        ? values.filter((item) => item !== value)
        : values.length < 3
          ? [...values, value]
          : values;
      this.profile.parkingAutomaticallyPrioritized = this.profile.transportation.includes('Car');
      if (!this.profile.transportation.includes('Car')) this.profile.carFuelType = '';
      this.persist();
      return;
    }
    if (key === 'childrenAgeGroups') max = this.profile.children;
    if (key === 'lifestyles') max = 3;
    let values = this.profile[key];
    if (values.includes(value)) values = values.filter((item) => item !== value);
    else if (max === undefined || values.length < max) values = [...values, value];
    this.profile[key] = values;
    if (key === 'districts' && values.length) this.profile.locationFlexible = false;
    this.persist();
  }
  flexible(): void {
    this.profile.locationFlexible = !this.profile.locationFlexible;
    if (this.profile.locationFlexible) {
      this.profile.districts = [];
      this.profile.selectedMapArea = undefined;
      this.profile.proximityLatitude = undefined;
      this.profile.proximityLongitude = undefined;
    }
    this.persist();
  }
  changeCount(key: 'adults' | 'children', amount: number): void {
    const minimum = key === 'adults' ? 1 : 0;
    const maximum = key === 'adults' ? 7 - this.profile.children : 7 - this.profile.adults;
    this.profile[key] = Math.min(maximum, Math.max(minimum, this.profile[key] + amount));
    if (key === 'children')
      this.profile.childrenAgeGroups = this.profile.childrenAgeGroups.slice(
        0,
        this.profile.children,
      );
    this.persist();
  }
  readonly bedroomOptions: Array<{ label: string; value: number | null }> = [
    { label: 'Studio', value: 0 },
    { label: '1 bedroom', value: 1 },
    { label: '2 bedrooms', value: 2 },
    { label: '3 bedrooms', value: 3 },
    { label: '4 or more', value: 4 },
    { label: 'Let AI decide', value: null },
  ];
  readonly maxBedroomChoices = 3;

  bedroomSelected(value: number | null): boolean {
    return value === null
      ? this.profile.bedrooms === null
      : selectedBedrooms(this.profile).includes(value);
  }

  /** Up to three bedroom counts; "Let AI decide" clears them and is cleared by any count. */
  setBedrooms(value: number | null): void {
    if (value === null) {
      this.profile.bedroomChoices = [];
      this.profile.bedrooms = null;
    } else {
      const current = this.profile.bedrooms === null ? [] : selectedBedrooms(this.profile);
      const choices = current.includes(value)
        ? current.filter((item) => item !== value)
        : current.length < this.maxBedroomChoices
          ? [...current, value].sort((a, b) => a - b)
          : current;
      this.profile.bedroomChoices = choices;
      this.profile.bedrooms = choices.length ? choices[0] : undefined;
    }
    this.persist();
  }
  readonly dogSizes: Array<{ value: DogSize; label: string; hint: string; iconSize: number }> = [
    { value: 'Small', label: 'Small', hint: 'Up to 10 kg', iconSize: 18 },
    { value: 'Medium', label: 'Medium', hint: '10–25 kg', iconSize: 24 },
    { value: 'Large', label: 'Large', hint: 'Over 25 kg', iconSize: 30 },
  ];

  isPetSelected(value: 'None' | PetKind): boolean {
    return value === 'None'
      ? this.profile.petType === 'None'
      : (this.profile.petTypes || []).includes(value);
  }

  /** Pets are multi-select: "No" clears every pet, and choosing a pet clears "No". */
  togglePet(value: 'None' | PetKind): void {
    if (value === 'None') {
      this.profile.petTypes = [];
      this.profile.petType = 'None';
      this.profile.hasPet = false;
      this.profile.petOtherType = '';
      this.profile.petCount = 1;
      this.profile.dogSize = undefined;
    } else {
      const chosen = new Set(this.profile.petTypes || []);
      if (chosen.has(value)) chosen.delete(value);
      else chosen.add(value);
      const pets = (['Dog', 'Cat', 'Other'] as const).filter((pet) => chosen.has(pet));
      this.profile.petTypes = pets;
      this.profile.petType = pets[0];
      this.profile.hasPet = pets.length ? true : null;
      if (!pets.includes('Other')) this.profile.petOtherType = '';
      if (!pets.includes('Dog')) this.profile.dogSize = undefined;
    }
    this.persist();
  }

  setDogSize(size: DogSize): void {
    this.profile.dogSize = size;
    this.persist();
  }

  /** "Dog (Medium), Cat" for the review; "No pets" / "Not answered" otherwise. */
  get petSummary(): string {
    if (this.profile.petType === 'None') return 'No pets';
    const pets = this.profile.petTypes || [];
    if (!pets.length) return 'Not answered';
    return pets
      .map((pet) =>
        pet === 'Dog' && this.profile.dogSize
          ? `Dog (${this.profile.dogSize})`
          : pet === 'Other'
            ? this.profile.petOtherType?.trim() || 'Other'
            : pet,
      )
      .join(', ');
  }
  setMetro(value: number | null): void {
    this.profile.metroDistanceMinutes = value;
    this.persist();
  }
  togglePriority(value: string): void {
    const priorities = this.profile.topPriorities;
    this.profile.topPriorities = priorities.includes(value)
      ? priorities.filter((priority) => priority !== value)
      : priorities.length < 5
        ? [...priorities, value]
        : priorities;
    this.persist();
  }
  selected(
    key: 'districts' | 'childrenAgeGroups' | 'transportation' | 'lifestyles',
    value: string,
  ): boolean {
    return this.profile[key].includes(value);
  }
  canContinue(step: number = this.step): boolean {
    switch (step) {
      case 14:
        return !!this.profile.nationality;
      case 0:
        return !!this.profile.gender;
      case 1:
        // Rent/Buy and the type of home are answered together.
        return !!this.profile.propertyGoal && (!!this.profile.homeTypes?.length || !!this.profile.homeType);
      case 2:
        return (
          this.profile.locationFlexible ||
          !!this.profile.districts.length ||
          !!this.profile.selectedMapArea
        );
      case 3:
        return (
          this.budgetForm.valid &&
          this.budgetForm.controls.max.value >= this.budgetForm.controls.min.value
        );
      case 4:
        return !!this.profile.householdType;
      case 5:
        return (
          this.profile.adults >= 1 &&
          (this.profile.children === 0 || !!this.profile.childrenAgeGroups.length)
        );
      case 6:
        return this.profile.bedrooms !== undefined;
      case 7:
        return this.profile.propertyGoal === 'Rent'
          ? !!this.profile.rentalDuration &&
              !!this.profile.moveInTiming &&
              (this.profile.moveInTiming !== 'SpecificDate' ||
                (!!this.profile.moveInDate && !isPastDate(this.profile.moveInDate)))
          : !!this.profile.purchaseTiming;
      case 8:
        return (
          !!this.profile.transportation.length &&
          (!this.profile.transportation.includes('Car') || !!this.profile.carFuelType)
        );
      case 9:
        return this.profile.lifestyles.length > 0 && this.profile.lifestyles.length <= 3;
      case 10: {
        if (this.profile.petType === 'None') return true;
        const pets = this.profile.petTypes || [];
        return (
          pets.length > 0 &&
          (!pets.includes('Dog') || !!this.profile.dogSize) &&
          (!pets.includes('Other') || !!this.profile.petOtherType?.trim()) &&
          Number(this.profile.petCount) >= 1
        );
      }
      case 11:
        return this.profile.topPriorities.length === 5;
      case 12:
        return !!this.profile.apartmentStyle;
      case 13:
        return (this.profile.propertyConditions?.length ?? 0) > 0;
      default:
        return false;
    }
  }
  next(): void {
    if (!this.canContinue()) return;
    if (this.step === 3) {
      this.profile.budgetMin = this.budgetForm.controls.min.value;
      this.profile.budgetMax = this.budgetForm.controls.max.value;
      this.profile.currency = this.budgetForm.controls.currency.value;
    }
    if (this.visibleSteps[this.stepNumber] === 11) {
      const suggestions = new Set(this.generateSuggestedPriorities().map((option) => option.value));
      this.profile.topPriorities = this.profile.topPriorities.filter((value) =>
        suggestions.has(value),
      );
    }
    this.persist();
    if (this.returnToReviewAfterStep) {
      // Changing a single answer from the profile page goes back to it — unless that change
      // (e.g. switching Rent/Buy) cleared other answers; then walk through those first.
      const missing = this.firstIncompleteStep();
      if (missing !== undefined) {
        this.step = missing;
        this.scrollToStepTop();
        return;
      }
      this.returnToReviewAfterStep = false;
      if (this.returnToResultsAfterStep) {
        // Changed from the results page: recalculate right away instead of showing the summary.
        this.returnToResultsAfterStep = false;
        this.submit();
        return;
      }
      this.showReview();
      return;
    }
    if (this.stepNumber < this.visibleSteps.length) {
      this.step = this.visibleSteps[this.stepNumber];
    } else this.showReview();
    this.scrollToStepTop();
  }
  private scrollToStepTop(): void {
    setTimeout(() => {
      const shell = document.querySelector<HTMLElement>('.wizard-shell');
      const top = shell ? shell.getBoundingClientRect().top + window.scrollY - 96 : 0;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  }
  back(): void {
    const previous = this.visibleSteps[this.stepNumber - 2];
    if (previous === undefined) return;
    // Going back must never erase answers: every step keeps what the user already chose.
    this.step = previous;
    this.persist();
    this.scrollToStepTop();
  }
  private clearStep(step: number): void {
    const fields: (keyof HomeMatchProfile)[][] = [
      ['gender'],
      ['propertyGoal'],
      [
        'districts',
        'locationFlexible',
        'selectedMapArea',
        'proximityTarget',
        'proximityAddress',
        'proximityLatitude',
        'proximityLongitude',
      ],
      ['budgetMin', 'budgetMax', 'currency'],
      ['householdType', 'adults', 'children', 'childrenAgeGroups'],
      ['adults', 'children', 'childrenAgeGroups'],
      ['bedrooms', 'bedroomChoices'],
      ['rentalDuration', 'moveInTiming', 'moveInDate', 'purchaseTiming'],
      ['transportation', 'metroDistanceMinutes', 'parkingAutomaticallyPrioritized', 'carFuelType'],
      ['lifestyles'],
      ['hasPet', 'petType', 'petTypes', 'dogSize', 'petOtherType', 'petCount'],
      ['topPriorities'],
      ['apartmentStyle'],
      ['propertyConditions'],
      ['nationality'],
    ];
    for (const key of fields[step]) {
      const value = EMPTY_HOME_MATCH_PROFILE[key];
      Object.assign(this.profile, { [key]: Array.isArray(value) ? [] : value });
    }
    if (step === 2) {
      this.mapVisible = false;
      this.pendingMapArea = '';
    }
    if (step === 3)
      this.budgetForm.reset({
        min: this.profile.budgetMin,
        max: this.profile.budgetMax,
        currency: this.profile.currency,
      });
  }
  edit(): void {
    this.view = 'questions';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  /** Opens the answer summary, where every answer has its own "Change" action. */
  /** First visible question that still has no valid answer, in the order questions are shown. */
  firstIncompleteStep(): number | undefined {
    return this.visibleSteps.find((step) => !this.canContinue(step));
  }

  showReview(): void {
    // The profile page (and "Find My Best Matches") is only reachable with every answer filled in.
    const missing = this.firstIncompleteStep();
    if (missing !== undefined) {
      this.returnToReviewAfterStep = true;
      this.step = missing;
      this.view = 'questions';
      this.quizStarted = true;
      this.scrollToStepTop();
      return;
    }
    this.view = 'review';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  /** Walks through every step again with all saved answers pre-selected; ends on the profile page. */
  /** "Reset Profile": forget every answer and start again from the first question. */
  resetProfile(): void {
    this.service.clearSession();
    this.service.reset();
    this.profile = {
      ...this.service.profile,
      gender: '',
      adults: 1,
      children: 0,
      lifestyles: [],
      petTypes: [],
      petCount: 1,
      topPriorities: [],
      // Nationality from the account stays: it is not a Velven Match answer.
      nationality: this.accountNationality || '',
    };
    this.budgetForm.setValue({ min: this.profile.budgetMin, max: this.profile.budgetMax, currency: this.profile.currency });
    this.matches = [];
    this.editSearchId = null;
    this.saveState = null;
    this.saveMessage = '';
    this.editProfile();
  }
  editProfile(): void {
    this.returnToReviewAfterStep = false;
    this.returnToResultsAfterStep = false;
    this.step = this.visibleSteps[0] ?? 0;
    this.view = 'questions';
    this.quizStarted = true;
    this.scrollToStepTop();
  }
  private returnToReviewAfterStep = false;
  /** True while one answer is being changed from the results page. */
  returnToResultsAfterStep = false;
  /** "Change" on the results page: edit that answer, then go straight back to updated results. */
  changeFromResults(step: number): void {
    this.goToStep(step);
    this.returnToResultsAfterStep = this.visibleSteps.includes(step);
  }
  goToStep(step: number): void {
    if (!this.visibleSteps.includes(step)) return;
    this.returnToResultsAfterStep = false;
    this.returnToReviewAfterStep = true;
    this.step = step;
    this.view = 'questions';
    this.quizStarted = true;
    this.scrollToStepTop();
  }
  submit(): void {
    if (this.intakeBusy) return;
    // Never calculate with an incomplete profile (it used to end in a calculation error).
    if (this.firstIncompleteStep() !== undefined) {
      this.showReview();
      return;
    }
    if (this.intakeToken !== null && this.intakeSavedProfile !== JSON.stringify(this.profile)) {
      this.view = 'intake';
      this.intakeError = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    this.view = 'loading';
    this.errorMessage = '';
    this.startLoadingMessages();
    this.service
      .findRankedMatches(this.profile)
      .pipe(
        finalize(() => {
          this.stopLoadingMessages();
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (response) => {
          this.matches = response;
          this.view = 'results';
          this.service.saveResults(JSON.stringify(this.profile), this.matches);
          this.saveSearchToAccount();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: () => {
          this.errorMessage = 'Please try again in a moment. Your answers are still saved.';
          this.view = 'error';
        },
      });
  }

  submitIntake(): void {
    if (this.intakeBusy) return;
    const contact = this.intakeContact;
    // Nationality is collected as the first questionnaire question.
    contact.nationality = this.profile.nationality || '';
    if (!contact.firstName.trim() || !isValidPhone(contact.phone) || !contact.consent) {
      this.intakeError = 'Enter your first name, a valid phone number and consent to contact.';
      return;
    }
    this.intakeBusy = true;
    this.intakeError = '';
    const submittedProfile = JSON.stringify(this.profile);
    this.intakeRequest = this.boardService.submit(this.intakeToken || '', this.profile, contact).subscribe({
      next: () => {
        this.intakeSavedProfile = submittedProfile;
        this.intakeBusy = false;
        this.submit();
        this.cdr.markForCheck();
      },
      error: error => {
        this.intakeBusy = false;
        this.intakeError = error.status === 404
          ? 'This intake link is no longer available. Please ask your agent for a new link.'
          : 'Your profile could not be submitted. Please retry.';
        this.cdr.markForCheck();
      },
    });
  }

  /** Saved search being edited (opened from Velven Discover); results update it instead of adding one. */
  private editSearchId: number | null = null;
  saveState: SearchSaveState = null;

  savedSearchName = '';
  savedSearchId: number | null = null;

  /** Default name for a saved search, e.g. "Vake, Saburtalo · Rent". */
  private defaultSearchName(): string {
    const places = this.profile.locationFlexible
      ? 'Flexible'
      : this.profile.districts.length
        ? answerList(this.profile.districts.slice(0, 2))
        : this.profile.selectedMapArea
          ? 'Selected map area'
          : 'Tbilisi';
    return `${places} · ${answerLabel(this.profile.propertyGoal)}`;
  }

  /**
   * Clients: every finished search is kept in Velven Discover (the same answers are saved once).
   * Visitors: offered to save it after signing in. Staff accounts are not offered saving.
   */
  saveSearchToAccount(): void {
    this.savedSearchId = null;
    if (!this.auth.isLoggedIn) {
      this.saveState = 'guest';
      return;
    }
    if (!this.auth.isPersonalAccount) {
      this.saveState = null;
      return;
    }
    this.saveState = 'saving';
    const profile = { ...this.profile };
    const name = this.defaultSearchName();
    // Editing replaces the old search. Without an edit id, a saved search with the same
    // name (same places and Rent/Buy) is updated too, so the list never shows two versions.
    const request: import('rxjs').Observable<{ id: number; name: string }> = this.editSearchId
      ? this.clientService.updateSearch(this.editSearchId, { profile })
      : this.clientService.getSearches().pipe(
          catchError(() => of([])),
          switchMap((searches) => {
            const same = searches.find((search) => search.name.trim().toLowerCase() === name.trim().toLowerCase());
            if (!same) return this.clientService.saveSearch(profile, name);
            this.editSearchId = same.id;
            return this.clientService.updateSearch(same.id, { profile });
          }),
        );
    request.subscribe({
      next: (saved) => {
        this.savedSearchId = saved.id;
        this.savedSearchName = saved.name;
        this.saveState = this.editSearchId ? 'updated' : 'saved';
        this.cdr.detectChanges();
      },
      error: (error) => {
        // Another saved search already has these answers: that one is kept.
        this.saveState = error?.status === 409 ? 'duplicate' : 'failed';
        this.cdr.detectChanges();
      },
    });
  }

  /** Visitor chose to save: keep the answers, then sign in or register. */
  saveAsGuest(register: boolean): void {
    this.clientService.keepPendingSearch({ ...this.profile }, this.defaultSearchName());
    void this.router.navigate([register ? '/register' : '/login'], {
      queryParams: { returnUrl: '/discover' },
    });
  }

  save(): void {
    this.saveMessage = this.service.saveToSession(this.profile)
      ? 'Your answers are saved for this browser session. Reloading this tab keeps them.'
      : 'Your answers could not be saved in this browser. Check that site storage is allowed.';
    this.cdr.detectChanges();
  }
  persist(): void {
    this.service.update({ ...this.profile });
  }
  private generateSuggestedPriorities(): HomeMatchOption[] {
    const suggestions = new Map<string, HomeMatchOption>();
    // These all say "near cafés" in slightly different words; offering two of them looked
    // like the same option twice, so only the first one that applies is kept.
    const cafeOptions = new Set([
      'CafesNearby',
      'CafesOrCoworkingNearby',
      'CafesAndRestaurantsNearby',
      'MeetingPlacesNearby',
      'StudySpacesNearby',
    ]);
    const add = (label: string, value: string, strongest = false): void => {
      if (suggestions.has(value)) return;
      if (cafeOptions.has(value) && [...suggestions.keys()].some((key) => cafeOptions.has(key)))
        return;
      const option = { label, value };
      if (!strongest) {
        suggestions.set(value, option);
        return;
      }
      const existing = [...suggestions.entries()];
      suggestions.clear();
      suggestions.set(value, option);
      existing.forEach(([key, item]) => suggestions.set(key, item));
    };

    const hasLocation =
      this.profile.districts.length > 0 ||
      (!!this.profile.proximityTarget && this.profile.proximityTarget !== 'No') ||
      !!this.profile.proximityAddress?.trim();
    if (hasLocation) add('Proximity to selected location', 'SelectedLocationNearby');
    // "Proximity to office" only makes sense once the office address was given on the location step.
    const officeAddressGiven =
      this.profile.proximityTarget === 'Workplace' && !!this.profile.proximityAddress?.trim();

    const familyHousehold =
      this.profile.children > 0 ||
      ['ParentWithChildren', 'FamilyWithChildren'].includes(this.profile.householdType);
    const ages = new Set(
      familyHousehold
        ? this.profile.childrenAgeGroups.slice(0, Math.max(0, this.profile.children))
        : [],
    );
    if (familyHousehold) {
      if (!ages.size) {
        add('Proximity to school', 'SchoolNearby');
        add('Proximity to kindergarten', 'KindergartenNearby');
        add('Proximity to park', 'ParkNearby');
        add('Proximity to playground', 'PlaygroundNearby');
        add('Proximity to clinic', 'ClinicNearby');
      }
      if (ages.has('Age0To3')) {
        add('Proximity to park', 'ParkNearby');
        add('Proximity to kindergarten', 'KindergartenNearby');
      }
      if (ages.has('Age4To6')) {
        add('Proximity to kindergarten', 'KindergartenNearby');
        add('Proximity to playground', 'PlaygroundNearby');
        add('Proximity to park', 'ParkNearby');
        add('Proximity to school', 'SchoolNearby');
      }
      if (ages.has('Age7To12')) {
        add('Proximity to school', 'SchoolNearby');
        add('Proximity to park', 'ParkNearby');
        add('Proximity to playground or sports field', 'PlaygroundOrSportsFieldNearby');
      }
      if (ages.has('Age13To17')) {
        add('Proximity to school', 'SchoolNearby');
        add('Proximity to metro', 'MetroNearby');
        add('Proximity to public transport', 'PublicTransportNearby');
        add('GYM', 'GymNearby');
      }
    }

    if (['Friends', 'Roommates'].includes(this.profile.householdType)) {
      add('Proximity to metro', 'MetroNearby');
      add('Proximity to selected location', 'SelectedLocationNearby');
    }
    if (this.profile.householdType === 'CorporateHousing') {
      if (officeAddressGiven) add('Proximity to office', 'OfficeNearby');
      add('Proximity to metro', 'MetroNearby');
      add('Parking', 'Parking');
      add('Isolated bedrooms', 'IsolatedBedrooms');
      add('Two or more bathrooms', 'MultipleBathrooms');
      add('Company lease available', 'CompanyLeaseAvailable');
    }

    if (this.profile.transportation.includes('Car')) add('Parking', 'Parking');
    if (this.profile.transportation.includes('Metro')) add('Proximity to metro', 'MetroNearby');
    if (this.profile.transportation.includes('Walking')) {
      add('Everyday services (supermarket, pharmacy)', 'EverydayServicesNearby');
      add('Proximity to cafés', 'CafesNearby');
      add('Proximity to park', 'ParkNearby');
    }

    const lifestyle = new Set(this.profile.lifestyles);
    if (lifestyle.has('Athlete')) {
      add('GYM', 'GymNearby');
      add('Proximity to park', 'ParkNearby');
    }
    if (lifestyle.has('RemoteWorker')) {
      add('Workspace', 'Workspace');
      add('Proximity to cafés or coworking spaces', 'CafesOrCoworkingNearby');
      add('Everyday services (supermarket, pharmacy)', 'EverydayServicesNearby');
    }
    if (lifestyle.has('BusinessProfessional')) {
      if (officeAddressGiven) add('Proximity to office', 'OfficeNearby', true);
      if (this.profile.transportation.includes('Car')) add('Parking', 'Parking');
      add('Proximity to cafés and restaurants for meetings', 'MeetingPlacesNearby');
      add('Security or concierge', 'SecurityOrConcierge');
      add('Modern and well-maintained building', 'ModernMaintainedBuilding');
    }
    if (lifestyle.has('Student')) {
      const specificUniversity =
        this.profile.proximityTarget === 'University' && !!this.profile.proximityAddress?.trim();
      add(
        specificUniversity
          ? `Proximity to ${this.profile.proximityAddress?.trim()}`
          : 'Proximity to university',
        'UniversityNearby',
        specificUniversity,
      );
      add('Proximity to metro', 'MetroNearby');
      add('Proximity to public transport', 'PublicTransportNearby');
      add('Proximity to cafés or study spaces', 'StudySpacesNearby');
    }
    if (lifestyle.has('QuietLifestyle')) {
      add('Quiet street', 'QuietStreet', true);
      add('Proximity to parks or green spaces', 'ParkNearby');
      add('Away from busy city center and nightlife', 'AwayFromNightlife');
    }
    if (lifestyle.has('SocialLifestyle')) {
      add('Proximity to cafés and restaurants', 'CafesAndRestaurantsNearby');
      add('Proximity to city center', 'CityCenterNearby');
      add('Proximity to bars and entertainment districts', 'EntertainmentNearby');
      add('Balcony or terrace', 'BalconyOrTerrace');
    }

    // Always offer enough meaningful choices to complete a five-item ranking.
    add('Everyday services (supermarket, pharmacy)', 'EverydayServicesNearby');
    add('Proximity to metro', 'MetroNearby');
    add('GYM', 'GymNearby');
    add('Proximity to park', 'ParkNearby');
    add('Quiet street', 'QuietStreet');

    return [...suggestions.values()];
  }
  private startLoadingMessages(): void {
    const messages = [
      'Understanding your lifestyle...',
      'Checking location preferences...',
      'Comparing nearby schools and gyms...',
      'Calculating trade-offs...',
      'Ranking your best matches...',
    ];
    let index = 0;
    this.loadingMessage = messages[0];
    this.loadingTimer = window.setInterval(() => {
      index = (index + 1) % messages.length;
      this.loadingMessage = messages[index];
      this.cdr.detectChanges();
    }, 1800);
  }
  private stopLoadingMessages(): void {
    if (this.loadingTimer) window.clearInterval(this.loadingTimer);
    this.loadingTimer = undefined;
  }
}
