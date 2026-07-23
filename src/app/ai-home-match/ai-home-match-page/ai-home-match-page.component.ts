import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { HomeMatchResult } from '../models/home-match-result';
import { HomeMatchOption, HomeMatchQuestion } from '../models/home-match-question';
import { HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchService } from '../services/home-match.service';
import { applyPriorityScoring } from '../services/priority-scoring';

type ViewState = 'questions' | 'review' | 'loading' | 'results' | 'error';
@Component({
  selector: 'app-ai-home-match-page',
  standalone: false,
  templateUrl: './ai-home-match-page.component.html',
  styleUrl: './ai-home-match-page.component.css',
})
export class AiHomeMatchPageComponent implements OnDestroy {
  readonly questions: HomeMatchQuestion[] = [
    { title: 'What are you looking for?' },
    { title: 'Where would you like to live?', subtitle: 'Choose one or more locations.' },
    { title: 'What is your budget?' },
    { title: 'Who will be living in the apartment?' },
    { title: 'How many people will live in the apartment?' },
    { title: 'How many bedrooms do you need?' },
    { title: 'Your timing' },
    { title: 'How do you usually get around?' },
    { title: 'Which options best describe your lifestyle?' },
    { title: 'Do you have a pet?' },
    { title: 'What would make the home feel right for you?', subtitle: 'Choose up to five.' },
    { title: 'Is there anything else we should know?' },
    { title: 'Rank your Top 3 priorities', subtitle: 'Choose them in order: first, second, then third.' },
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
    [
      'Just me',
      'Couple',
      'Parent with child or children',
      'Family with children',
      'Friends',
      'Relatives',
      'Roommates',
      'Company employees',
      'Other',
    ],
    [
      'JustMe',
      'Couple',
      'ParentWithChildren',
      'FamilyWithChildren',
      'Friends',
      'Relatives',
      'Roommates',
      'CorporateHousing',
      'Other',
    ],
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
  readonly preferences = this.opts(
    [
      'School nearby',
      'Kindergarten nearby',
      'Park nearby',
      'Gym nearby',
      'Metro nearby',
      'Balcony',
      'Good natural light',
      'Quiet street',
      'Large living room',
      'Large kitchen',
      'Separate workspace',
      'Good view',
      'Two or more bathrooms',
      'Air conditioning in every bedroom',
      'Security or concierge',
      'Elevator',
      'Yard or terrace',
      'New building',
      'Additional storage',
    ],
    [
      'SchoolNearby',
      'KindergartenNearby',
      'ParkNearby',
      'GymNearby',
      'MetroNearby',
      'Balcony',
      'NaturalLight',
      'QuietStreet',
      'LargeLivingRoom',
      'LargeKitchen',
      'SeparateWorkspace',
      'GoodView',
      'MultipleBathrooms',
      'BedroomAirConditioning',
      'SecurityOrConcierge',
      'Elevator',
      'YardOrTerrace',
      'NewBuilding',
      'AdditionalStorage',
    ],
  );
  readonly additional = this.opts(
    [
      'Low floor',
      'High floor',
      'Large elevator',
      'Two or more bathrooms',
      'Ability to replace furniture',
      'Ability to remove furniture',
      'Separate kitchen',
      'All bedrooms must be isolated',
      'Contract under a company name',
      '24/7 security',
      'Generator',
      'Water reservoir',
      'Other',
    ],
    [
      'LowFloor',
      'HighFloor',
      'LargeElevator',
      'MultipleBathrooms',
      'ReplaceFurniture',
      'RemoveFurniture',
      'SeparateKitchen',
      'IsolatedBedrooms',
      'CompanyContract',
      'Security24Hours',
      'Generator',
      'WaterReservoir',
      'Other',
    ],
  );
  readonly transport = this.opts(
    ['Car', 'Metro', 'Walking', 'Public transport', 'Taxi', 'Multiple methods'],
    ['Car', 'Metro', 'Walking', 'PublicTransport', 'Taxi', 'MultipleMethods'],
  );
  profile: HomeMatchProfile;
  step = 0;
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
    this.profile = { ...service.profile, topPriorities: service.profile.topPriorities || [] };
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
    return ((this.step + 1) / this.questions.length) * 100;
  }
  get suggestedPriorities(): HomeMatchOption[] {
    return this.generateSuggestedPriorities();
  }
  opts(labels: string[], values?: string[]): HomeMatchOption[] {
    return labels.map((label, index) => ({ label, value: values?.[index] || label }));
  }
  choose(
    key:
      | 'propertyGoal'
      | 'householdType'
      | 'additionalRoom'
      | 'rentalDuration'
      | 'moveInTiming'
      | 'purchaseTiming'
      | 'proximityTarget',
    value: string,
  ): void {
    (this.profile as Record<typeof key, string | undefined>)[key] = value;
    this.persist();
  }
  toggle(
    key:
      | 'districts'
      | 'childrenAgeGroups'
      | 'transportation'
      | 'lifestyles'
      | 'mainPreferences'
      | 'additionalRequirements',
    value: string,
    max?: number,
  ): void {
    let values = this.profile[key];
    if (values.includes(value)) values = values.filter((item) => item !== value);
    else if (!max || values.length < max) values = [...values, value];
    this.profile[key] = values;
    if (key === 'districts' && values.length) this.profile.locationFlexible = false;
    if (key === 'transportation')
      this.profile.parkingAutomaticallyPrioritized = values.includes('Car');
    this.persist();
  }
  flexible(): void {
    this.profile.locationFlexible = !this.profile.locationFlexible;
    if (this.profile.locationFlexible) this.profile.districts = [];
    this.persist();
  }
  changeCount(key: 'adults' | 'children', amount: number): void {
    const minimum = key === 'adults' ? 1 : 0;
    this.profile[key] = Math.max(minimum, this.profile[key] + amount);
    if (key === 'children' && this.profile.children === 0) this.profile.childrenAgeGroups = [];
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
  setUtilities(value: boolean | null): void {
    this.profile.includesUtilities = value;
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
      : priorities.length < 3
        ? [...priorities, value]
        : priorities;
    this.persist();
  }
  selected(
    key:
      | 'districts'
      | 'childrenAgeGroups'
      | 'transportation'
      | 'lifestyles'
      | 'mainPreferences'
      | 'additionalRequirements',
    value: string,
  ): boolean {
    return this.profile[key].includes(value);
  }
  canContinue(): boolean {
    switch (this.step) {
      case 0:
        return !!this.profile.propertyGoal;
      case 1:
        return (
          (this.profile.locationFlexible || !!this.profile.districts.length) &&
          (!this.profile.proximityTarget ||
            this.profile.proximityTarget === 'No' ||
            !!this.profile.proximityAddress?.trim())
        );
      case 2:
        return (
          this.budgetForm.valid &&
          this.budgetForm.controls.max.value >= this.budgetForm.controls.min.value &&
          this.profile.includesUtilities !== undefined
        );
      case 3:
        return !!this.profile.householdType;
      case 4:
        return (
          this.profile.adults >= 1 &&
          (this.profile.children === 0 || !!this.profile.childrenAgeGroups.length)
        );
      case 5:
        return this.profile.bedrooms !== undefined && !!this.profile.additionalRoom;
      case 6:
        return this.profile.propertyGoal === 'Rent'
          ? !!this.profile.rentalDuration &&
              !!this.profile.moveInTiming &&
              (this.profile.moveInTiming !== 'SpecificDate' || !!this.profile.moveInDate)
          : !!this.profile.purchaseTiming;
      case 7:
        return (
          !!this.profile.transportation.length &&
          (!this.profile.transportation.includes('Metro') ||
            this.profile.metroDistanceMinutes !== undefined)
        );
      case 8:
        return !!this.profile.lifestyles.length;
      case 9:
        return this.profile.hasPet !== null;
      case 10:
        return this.profile.mainPreferences.length > 0 && this.profile.mainPreferences.length <= 5;
      case 11:
        return true;
      case 12:
        return this.profile.topPriorities.length === 3;
      default:
        return false;
    }
  }
  next(): void {
    if (!this.canContinue()) return;
    if (this.step === 2) {
      this.profile.budgetMin = this.budgetForm.controls.min.value;
      this.profile.budgetMax = this.budgetForm.controls.max.value;
      this.profile.currency = this.budgetForm.controls.currency.value;
    }
    if (this.step === 11) {
      const suggestions = new Set(this.generateSuggestedPriorities().map((option) => option.value));
      this.profile.topPriorities = this.profile.topPriorities.filter((value) => suggestions.has(value));
    }
    this.persist();
    if (this.step < this.questions.length - 1) this.step++;
    else this.view = 'review';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  back(): void {
    if (this.step > 0) this.step--;
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
    add('Best value within budget', 'BestValueWithinBudget');

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
        add('Proximity to sports facilities', 'SportsFacilitiesNearby');
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
      add('Proximity to gym', 'GymNearby');
      add('Proximity to park', 'ParkNearby');
      add('Proximity to sports facilities', 'SportsFacilitiesNearby');
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
