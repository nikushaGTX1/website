import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { HomeMatchResult } from '../models/home-match-result';
import { HomeMatchOption, HomeMatchQuestion } from '../models/home-match-question';
import { EMPTY_HOME_MATCH_PROFILE, HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchService } from '../services/home-match.service';
import { GeoJsonPolygon } from '../../services/apartment.service';
import { applyPriorityScoring } from '../services/priority-scoring';

type ViewState = 'questions' | 'review' | 'loading' | 'results' | 'error';
@Component({
  selector: 'app-ai-home-match-page',
  standalone: false,
  templateUrl: './ai-home-match-page.component.html',
  styleUrl: './ai-home-match-page.component.css',
})
export class AiHomeMatchPageComponent implements OnDestroy {
  readonly phaseLabels = [
    'Lifestyle',
    'Location',
    'Home Details',
    'Preferences',
    'Budget',
    'Review',
  ];
  readonly questions: HomeMatchQuestion[] = [
    { title: 'Select your gender' },
    { title: 'What are you looking for?' },
    { title: 'Where would you like to live?', subtitle: 'Choose one or more locations.' },
    { title: 'What is your budget?' },
    { title: 'Who will be living in the apartment?' },
    { title: 'How many people will live in the apartment?' },
    { title: 'How many bedrooms do you need?' },
    { title: 'Your timing' },
    { title: 'How do you usually get around?' },
    { title: 'Which options best describe your lifestyle?', subtitle: 'Choose up to 3 options.' },
    { title: 'Do you have a pet?' },
    {
      title: 'Rank your Top 5 priorities',
      subtitle: 'Choose them in order from most to least important.',
    },
  ];
  readonly districts = this.opts(
    [
      'Vake',
      'Saburtalo',
      'Vera',
      'Mtatsminda',
      'Dighomi',
      'Didi Dighomi',
      'Isani',
      'Ortachala',
      'Other district',
      'Select on map',
    ],
    [
      'Vake',
      'Saburtalo',
      'Vera',
      'Mtatsminda',
      'Dighomi',
      'DidiDighomi',
      'Isani',
      'Ortachala',
      'OtherDistrict',
      'SelectOnMap',
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
      'Family focused',
      'Quiet lifestyle',
      'Social and active lifestyle',
      'I often host guests',
      'I travel frequently',
    ],
    [
      'Athlete',
      'RemoteWorker',
      'BusinessProfessional',
      'Student',
      'FamilyFocused',
      'QuietLifestyle',
      'SocialLifestyle',
      'HostsGuests',
      'FrequentTraveler',
    ],
  );
  readonly transport = this.opts(
    ['Car', 'Metro', 'Walking', 'Public transport', 'Taxi', 'Multiple methods'],
    ['Car', 'Metro', 'Walking', 'PublicTransport', 'Taxi', 'MultipleMethods'],
  );
  profile: HomeMatchProfile;
  step = 1;
  mapVisible = false;
  pendingMapArea = '';
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
    min: new FormControl(1000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    max: new FormControl(1800, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    currency: new FormControl<'USD' | 'GEL' | 'EUR'>('USD', { nonNullable: true }),
  });
  constructor(
    private service: HomeMatchService,
    private cdr: ChangeDetectorRef,
  ) {
    service.reset();
    this.profile = {
      ...service.profile,
      gender: service.profile.gender || '',
      adults: Math.min(7, Math.max(1, service.profile.adults || 1)),
      children: Math.min(
        Math.max(0, 7 - Math.min(7, Math.max(1, service.profile.adults || 1))),
        Math.max(0, service.profile.children || 0),
      ),
      topPriorities: service.profile.topPriorities || [],
    };
    this.budgetForm.setValue({
      min: this.profile.budgetMin,
      max: this.profile.budgetMax,
      currency: this.profile.currency,
    });
  }
  ngOnDestroy(): void {
    if (this.loadingTimer) window.clearInterval(this.loadingTimer);
  }
  get question(): HomeMatchQuestion {
    return this.questions[this.step];
  }
  get progress(): number {
    return (this.stepNumber / this.visibleSteps.length) * 100;
  }
  get visibleSteps(): number[] {
    return [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((step) =>
      !(this.profile.propertyGoal === 'Buy' && [4, 5, 10].includes(step)) &&
      !(step === 5 && this.fixedHousehold),
    );
  }
  get stepNumber(): number {
    return this.visibleSteps.indexOf(this.step) + 1;
  }
  get budgetSliderMax(): number {
    const buying = this.profile.propertyGoal === 'Buy';
    if (this.budgetForm.controls.currency.value === 'GEL') {
      return buying ? 5_000_000 : 50_000;
    }
    return buying ? 2_000_000 : 20_000;
  }
  get budgetSliderStep(): number {
    return this.profile.propertyGoal === 'Buy' ? 5_000 : 50;
  }
  get budgetRangeStart(): number {
    return this.budgetPercent(this.budgetForm.controls.min.value);
  }
  get budgetRangeEnd(): number {
    return this.budgetPercent(this.budgetForm.controls.max.value);
  }
  get currentPhase(): number {
    return Math.min(
      this.phaseLabels.length - 1,
      Math.floor(((this.stepNumber - 1) * this.phaseLabels.length) / this.visibleSteps.length),
    );
  }
  get householdLabel(): string {
    if (!this.profile.householdType) return 'Tell us who will live there';
    const household = this.profile.householdType.replace(/([a-z])([A-Z])/g, '$1 $2');
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
        ? this.profile.districts.join(', ')
        : this.profile.selectedMapArea
          ? 'Selected map area'
          : 'Not selected yet';
  }
  scrollToMatcher(): void {
    document.querySelector('.wizard-shell')?.scrollIntoView({ behavior: 'smooth' });
  }
  get suggestedPriorities(): HomeMatchOption[] {
    const rank = (value: unknown): number => {
      const index = this.profile.topPriorities.indexOf(String(value));
      return index < 0 ? Infinity : index;
    };
    return this.generateSuggestedPriorities().sort((a, b) => rank(a.value) - rank(b.value));
  }
  get currentStepIcon(): string {
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
      largelivingroom: 'home',
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
  opts(labels: string[], values?: string[]): HomeMatchOption[] {
    return labels.map((label, index) => ({ label, value: values?.[index] || label }));
  }
  choose(
    key:
      | 'propertyGoal'
      | 'gender'
      | 'householdType'
      | 'rentalDuration'
      | 'moveInTiming'
      | 'purchaseTiming'
      | 'proximityTarget',
    value: string,
  ): void {
    (this.profile as Record<typeof key, string | undefined>)[key] = value;
    if (key === 'propertyGoal') {
      for (const step of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) this.clearStep(step);
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
    if (key === 'childrenAgeGroups') max = this.profile.children;
    if (key === 'lifestyles') max = 3;
    let values = this.profile[key];
    if (values.includes(value)) values = values.filter((item) => item !== value);
    else if (max === undefined || values.length < max) values = [...values, value];
    this.profile[key] = values;
    if (key === 'districts' && values.length) this.profile.locationFlexible = false;
    if (key === 'transportation')
      this.profile.parkingAutomaticallyPrioritized = values.includes('Car');
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
  setBedrooms(value: number | null): void {
    this.profile.bedrooms = value;
    this.persist();
  }
  setPet(value: boolean): void {
    this.profile.hasPet = value;
    this.persist();
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
  updateBudgetFromSlider(bound: 'min' | 'max', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;

    const minControl = this.budgetForm.controls.min;
    const maxControl = this.budgetForm.controls.max;
    if (bound === 'min') {
      minControl.setValue(Math.min(value, maxControl.value));
      minControl.markAsDirty();
    } else {
      maxControl.setValue(Math.max(value, minControl.value));
      maxControl.markAsDirty();
    }
  }
  formatBudget(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.budgetForm.controls.currency.value,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }
  canContinue(): boolean {
    switch (this.step) {
      case 0:
        return !!this.profile.gender;
      case 1:
        return !!this.profile.propertyGoal;
      case 2:
        return (
          (this.profile.locationFlexible ||
            !!this.profile.districts.length ||
            !!this.profile.selectedMapArea) &&
          (!this.profile.proximityTarget ||
            this.profile.proximityTarget === 'No' ||
            !!this.profile.proximityAddress?.trim())
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
              (this.profile.moveInTiming !== 'SpecificDate' || !!this.profile.moveInDate)
          : !!this.profile.purchaseTiming;
      case 8:
        return !!this.profile.transportation.length;
      case 9:
        return this.profile.lifestyles.length > 0 && this.profile.lifestyles.length <= 3;
      case 10:
        return this.profile.hasPet !== null;
      case 11:
        return this.profile.topPriorities.length === 5;
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
    if (this.step < this.questions.length - 1) {
      this.step = this.visibleSteps[this.stepNumber];
    } else this.view = 'review';
  }
  back(): void {
    const previous = this.visibleSteps[this.stepNumber - 2];
    if (previous === undefined) return;
    const order = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (const step of order.slice(order.indexOf(previous))) this.clearStep(step);
    this.step = previous;
    this.persist();
  }
  private clearStep(step: number): void {
    const fields: (keyof HomeMatchProfile)[][] = [
      ['gender'], ['propertyGoal'],
      ['districts', 'locationFlexible', 'selectedMapArea', 'proximityTarget', 'proximityAddress', 'proximityLatitude', 'proximityLongitude'],
      ['budgetMin', 'budgetMax', 'currency'],
      ['householdType', 'adults', 'children', 'childrenAgeGroups'],
      ['adults', 'children', 'childrenAgeGroups'], ['bedrooms'],
      ['rentalDuration', 'moveInTiming', 'moveInDate', 'purchaseTiming'],
      ['transportation', 'metroDistanceMinutes', 'parkingAutomaticallyPrioritized'],
      ['lifestyles'], ['hasPet'], ['topPriorities'],
    ];
    for (const key of fields[step]) {
      const value = EMPTY_HOME_MATCH_PROFILE[key];
      Object.assign(this.profile, { [key]: Array.isArray(value) ? [] : value });
    }
    if (step === 2) {
      this.mapVisible = false;
      this.pendingMapArea = '';
    }
    if (step === 3) this.budgetForm.reset({
      min: this.profile.budgetMin, max: this.profile.budgetMax, currency: this.profile.currency,
    });
  }
  edit(): void {
    this.view = 'questions';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  submit(): void {
    this.view = 'loading';
    this.errorMessage = '';
    this.startLoadingMessages();
    this.service
      .findMatches(this.profile)
      .pipe(
        finalize(() => {
          this.stopLoadingMessages();
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (response) => {
          this.matches = (Array.isArray(response) ? response : response.matches)
            .map((match) => applyPriorityScoring(match, this.profile))
            .sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
          this.view = 'results';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: () => {
          this.errorMessage = 'Please try again in a moment. Your answers are still saved.';
          this.view = 'error';
        },
      });
  }
  save(): void {
    this.saving = true;
    this.saveMessage = '';
    this.service
      .saveProfile(this.profile)
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => (this.saveMessage = 'Your Home Profile has been saved.'),
        error: () =>
          (this.saveMessage =
            'Profile saving is not available yet. Your answers remain saved for this browser session.'),
      });
  }
  persist(): void {
    this.service.update({ ...this.profile });
  }
  private generateSuggestedPriorities(): HomeMatchOption[] {
    const suggestions = new Map<string, HomeMatchOption>();
    const add = (label: string, value: string, strongest = false): void => {
      if (suggestions.has(value)) return;
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

    const familyHousehold = ['ParentWithChildren', 'FamilyWithChildren'].includes(
      this.profile.householdType,
    );
    const ages = new Set(this.profile.childrenAgeGroups);
    if (familyHousehold || this.profile.lifestyles.includes('FamilyFocused')) {
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
      add('Large living room', 'LargeLivingRoom');
    }
    if (this.profile.householdType === 'CorporateHousing') {
      add('Proximity to office', 'OfficeNearby');
      add('Proximity to metro', 'MetroNearby');
      add('Parking', 'Parking');
      add('Isolated bedrooms', 'IsolatedBedrooms');
      add('Two or more bathrooms', 'MultipleBathrooms');
      add('Company lease available', 'CompanyLeaseAvailable');
    }

    if (this.profile.transportation.includes('Car')) add('Parking', 'Parking');
    if (this.profile.transportation.includes('Metro')) add('Proximity to metro', 'MetroNearby');
    if (this.profile.transportation.includes('Walking')) {
      add('Walking access to everyday services', 'EverydayServicesNearby');
      add('Proximity to supermarket', 'SupermarketNearby');
      add('Proximity to pharmacy', 'PharmacyNearby');
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
      add('Proximity to everyday services', 'EverydayServicesNearby');
    }
    if (lifestyle.has('BusinessProfessional')) {
      add('Proximity to office', 'OfficeNearby', true);
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
      add('Quiet Residential Environment', 'QuietResidentialEnvironment');
      add('Proximity to parks or green spaces', 'ParkNearby');
      add('Away from busy city center and nightlife', 'AwayFromNightlife');
    }
    if (lifestyle.has('SocialLifestyle')) {
      add('Proximity to cafés and restaurants', 'CafesAndRestaurantsNearby');
      add('Proximity to city center', 'CityCenterNearby');
      add('Proximity to bars and entertainment districts', 'EntertainmentNearby');
      add('Large living room', 'LargeLivingRoom');
      add('Balcony or terrace', 'BalconyOrTerrace');
    }

    return [...suggestions.values()];
  }
  private budgetPercent(value: number): number {
    const safeValue = Math.max(0, Math.min(Number(value) || 0, this.budgetSliderMax));
    return (safeValue / this.budgetSliderMax) * 100;
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
