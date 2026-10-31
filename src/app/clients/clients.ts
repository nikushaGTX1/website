import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { claimEscape, escapeAlreadyHandled } from '../utils/escape-layer';
import { lockPageScroll, unlockPageScroll } from '../utils/page-scroll-lock';

type FilterKey = 'district' | 'budget' | 'timing' | 'residents' | 'pets';
interface FilterDef {
  key: FilterKey;
  label: string;
  icon: string;
  options: Array<{ value: string; label: string }>;
}
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { BoardClient, BoardPage, ClientBoardService } from '../services/client-board.service';
import { VelvenLifestyleAvatarComponent } from '../ai-home-match/lifestyle-avatar/lifestyle-avatar.component';
import { EMPTY_HOME_MATCH_PROFILE } from '../ai-home-match/models/home-match-profile';
import { answerLabel } from '../ai-home-match/services/answer-labels';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';

// Windows has no flag emoji; this loads a small flag font instead.
polyfillCountryFlagEmojis();

/** English country name -> flag emoji ("Georgia" -> 🇬🇪), built once from the browser's country names. */
let flagsByCountry: Map<string, string> | undefined;
function countryFlag(name: string | null | undefined): string {
  const key = name?.trim().toLowerCase();
  if (!key) return '';
  if (!flagsByCountry) {
    flagsByCountry = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const a of letters) for (const b of letters) {
      const code = a + b;
      const country = names.of(code);
      if (country && country !== code && !flagsByCountry.has(country.toLowerCase())) {
        flagsByCountry.set(country.toLowerCase(), String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))));
      }
    }
  }
  return flagsByCountry.get(key) ?? '';
}

@Component({
  selector: 'app-clients',
  imports: [CommonModule, FormsModule, RouterLink, VelvenLifestyleAvatarComponent],
  templateUrl: './clients.html',
  styleUrl: './clients.css',
})
export class Clients implements OnInit, OnDestroy {
  readonly label = answerLabel;
  readonly hero = {
    ...EMPTY_HOME_MATCH_PROFILE,
    gender: 'Female' as const,
    adults: 2,
    householdType: 'Couple',
    hasPet: true,
    petTypes: ['Dog' as const],
  };
  readonly districts = [
    'Vake',
    'Saburtalo',
    'Vera',
    'Mtatsminda',
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
  ];
  district = '';
  budget = '';
  timing = '';
  residents = '';
  pets = '';
  /** Filter menu currently open (Velven-styled menus instead of the browser's selects). */
  openFilter: FilterKey | null = null;

  get filters(): FilterDef[] {
    return [
      {
        key: 'district',
        label: 'District',
        icon: 'fa-solid fa-location-dot',
        options: [{ value: '', label: 'All districts' }, ...this.districts.map((d) => ({ value: d, label: this.label(d) }))],
      },
      {
        key: 'budget',
        label: 'Budget',
        icon: 'fa-solid fa-wallet',
        // Renters give a monthly budget, buyers a purchase price.
        options: this.goal === 'Buy'
          ? [
              { value: '', label: 'USD total' },
              { value: '0-100000', label: 'Up to $100,000' },
              { value: '100000-200000', label: '$100,000 – $200,000' },
              { value: '200000-400000', label: '$200,000 – $400,000' },
              { value: '400000-', label: '$400,000+' },
            ]
          : [
              { value: '', label: 'USD / month' },
              { value: '0-500', label: '$0 – $500' },
              { value: '500-1000', label: '$500 – $1,000' },
              { value: '1000-1500', label: '$1,000 – $1,500' },
              { value: '1500-', label: '$1,500+' },
            ],
      },
      {
        key: 'timing',
        label: 'Move-in date',
        icon: 'fa-regular fa-calendar',
        options: [
          { value: '', label: 'Any date' },
          { value: '7', label: 'Within one week' },
          { value: '30', label: 'Within one month' },
          { value: '90', label: 'Within 3 months' },
        ],
      },
      {
        key: 'residents',
        label: 'Residents',
        icon: 'fa-solid fa-user-group',
        options: [{ value: '', label: 'Any household' }, ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))],
      },
      {
        key: 'pets',
        label: 'Pets',
        icon: 'fa-solid fa-paw',
        options: [
          { value: '', label: 'Any' },
          { value: 'true', label: 'With pets' },
          { value: 'false', label: 'No pets' },
        ],
      },
    ];
  }

  filterValue(key: FilterKey): string {
    return String(this[key] ?? '');
  }

  selectedLabel(filter: FilterDef): string {
    return filter.options.find((option) => option.value === this.filterValue(filter.key))?.label ?? filter.options[0].label;
  }

  /** Phones: filter choices open as a sheet from the bottom instead of a dropdown. */
  filterSheet = false;

  get openFilterDef(): FilterDef | undefined {
    return this.filters.find((filter) => filter.key === this.openFilter);
  }

  /** The sheet is moved to <body> so it covers the screen above the site header. */
  @ViewChild('sheetPortal') set sheetPortal(ref: ElementRef<HTMLElement> | undefined) {
    if (ref && ref.nativeElement.parentElement !== document.body) document.body.appendChild(ref.nativeElement);
  }

  toggleFilter(key: FilterKey): void {
    this.filterSheet = window.matchMedia('(max-width: 620px)').matches;
    // District opens the area picker (same design as the Explore location picker).
    if (key === 'district') {
      this.openDistrictPicker();
      return;
    }
    this.openFilter = this.openFilter === key ? null : key;
  }

  // ---------- Area picker ----------

  readonly popularDistricts = [
    { value: 'Vake', description: 'Premium central area', icon: '/icons/areas/vake-tree.svg' },
    { value: 'Saburtalo', description: 'Central & convenient', icon: '/icons/areas/saburtalo-buildings.svg' },
    { value: 'Vera', description: 'Historic central', icon: '/icons/areas/vera-heritage-house.svg' },
    { value: 'Mtatsminda', description: 'Old city & views', icon: '/icons/areas/mtatsminda-columns.svg' },
  ];
  districtPickerOpen = false;
  /**
   * The page sits in its own layer under the site header, so the open picker is moved to the
   * end of <body> to cover the whole screen (Angular still removes it when it closes).
   */
  @ViewChild('areaPortal') set areaPortal(ref: ElementRef<HTMLElement> | undefined) {
    if (ref && ref.nativeElement.parentElement !== document.body) document.body.appendChild(ref.nativeElement);
  }
  /** Choice inside the picker; applied only with "Apply changes". */
  pendingDistrict = '';
  districtQuery = '';

  get otherDistricts(): string[] {
    const popular = new Set(this.popularDistricts.map((item) => item.value));
    return this.districts.filter((d) => !popular.has(d) && this.matchesQuery(d));
  }

  get visiblePopular() {
    return this.popularDistricts.filter((item) => this.matchesQuery(item.value));
  }

  private matchesQuery(value: string): boolean {
    const query = this.districtQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    const translated = document.querySelector(`[data-district="${value}"]`)?.textContent || '';
    return [value, this.label(value), translated].some((text) => text.toLocaleLowerCase().includes(query));
  }

  openDistrictPicker(): void {
    this.openFilter = null;
    this.pendingDistrict = this.district;
    this.districtQuery = '';
    this.districtPickerOpen = true;
    lockPageScroll();
  }

  closeDistrictPicker(): void {
    if (!this.districtPickerOpen) return;
    this.districtPickerOpen = false;
    unlockPageScroll();
  }

  applyDistrict(): void {
    this.district = this.pendingDistrict;
    this.closeDistrictPicker();
    this.search();
  }

  chooseFilter(key: FilterKey, value: string): void {
    this[key] = value;
    this.openFilter = null;
  }

  @HostListener('document:click', ['$event'])
  closeFilterOnOutsideClick(event: MouseEvent): void {
    if (!this.openFilter || this.filterSheet) return;
    const open = this.host?.nativeElement.querySelector('.filter.open');
    if (open && !open.contains(event.target as Node)) this.openFilter = null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeFilterOnEscape(event: Event): void {
    if (this.districtPickerOpen && !escapeAlreadyHandled(event)) {
      claimEscape(event);
      this.closeDistrictPicker();
      return;
    }
    if (!this.openFilter || escapeAlreadyHandled(event)) return;
    claimEscape(event);
    this.openFilter = null;
  }
  loading = true;
  error = false;
  result: BoardPage = { items: [], total: 0, page: 1, pageSize: 12 };
  private request?: Subscription;
  constructor(
    private api: ClientBoardService,
    private cdr: ChangeDetectorRef,
    private host?: ElementRef<HTMLElement>,
  ) {}
  ngOnInit() {
    this.search();
  }
  ngOnDestroy() {
    this.closeDistrictPicker();
    this.request?.unsubscribe();
  }
  /** Renters or buyers (one at a time, so purchase budgets never mix with rents). */
  goal: 'Rent' | 'Buy' = 'Rent';

  setGoal(goal: 'Rent' | 'Buy'): void {
    if (goal === this.goal) return;
    this.goal = goal;
    this.budget = '';
    this.timing = '';
    this.search();
  }

  search(page = 1) {
    this.request?.unsubscribe();
    this.loading = true;
    this.error = false;
    const filters: Record<string, string | number | boolean> = {
      page,
      goal: this.goal,
      district: this.district,
      residents: this.residents,
      pets: this.pets,
    };
    if (this.budget) {
      const [min, max] = this.budget.split('-');
      filters['budgetMin'] = min;
      if (max) filters['budgetMax'] = max;
    }
    if (this.timing) {
      const date = new Date();
      date.setDate(date.getDate() + Number(this.timing));
      filters['moveInBefore'] =
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    this.request = this.api.board(filters).subscribe({
      next: (result) => {
        this.result = result;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
  /**
   * Example cards shown only while the board has no real clients and no filter is set,
   * clearly labelled as examples so owners see what a client profile looks like.
   */
  readonly examples: BoardClient[] = [
    this.example(1042, 'Georgia', 900, 1200, ['Vake', 'Saburtalo'], 2, 'Dog', 'Small', 2, 65, ['ParkNearby', 'BalconyOrTerrace', 'Workspace']),
    this.example(1086, 'France', 700, 900, ['Saburtalo'], 1, 'Cat', undefined, 1, 45, ['MetroNearby', 'Workspace', 'QuietStreet']),
    this.example(1103, 'Poland', 1200, 1500, ['Vake'], 2, undefined, undefined, 2, 75, ['Parking', 'QuietStreet', 'BalconyOrTerrace']),
  ];

  private example(id: number, nationality: string, budgetMin: number, budgetMax: number, districts: string[],
    adults: number, pet: 'Dog' | 'Cat' | undefined, dogSize: 'Small' | undefined, bedrooms: number, minSize: number,
    topPriorities: string[]): BoardClient {
    return {
      id,
      identityVerified: false,
      nationality,
      agent: { name: 'Velven team', phone: null, photo: null },
      profile: {
        ...EMPTY_HOME_MATCH_PROFILE,
        gender: id === 1086 ? 'Male' : 'Female',
        householdType: adults > 1 ? 'Couple' : 'Single',
        adults,
        currency: 'USD',
        budgetMin,
        budgetMax,
        districts,
        hasPet: !!pet,
        petType: pet ?? 'None',
        petTypes: pet ? [pet] : [],
        petCount: pet ? 1 : 0,
        dogSize,
        bedrooms,
        minSize,
        rentalDuration: 'TwelveMonths',
        moveInTiming: 'WithinOneMonth',
        topPriorities,
      } as BoardClient['profile'],
    };
  }

  get hasFilters(): boolean {
    return !!(this.district || this.budget || this.timing || this.residents || this.pets);
  }

  /** Examples stand in for an empty Rent board with no filters set. */
  get showingExamples(): boolean {
    return !this.loading && !this.error && !this.result.items.length && !this.hasFilters && this.goal === 'Rent';
  }

  get cards(): BoardClient[] {
    return this.showingExamples ? this.examples : this.result.items;
  }

  get pages() {
    return Math.ceil(this.result.total / this.result.pageSize);
  }
  flag(nationality: string | null | undefined): string {
    return countryFlag(nationality);
  }
  currencySymbol(currency: string): string {
    return ({ USD: '$', EUR: '€', GEL: '₾' } as Record<string, string>)[currency] ?? currency + ' ';
  }
  /** One label per pet, each its own text so the page translator can translate it. */
  petNames(client: BoardClient): string[] {
    const profile = client.profile;
    const pets = profile.petTypes?.length ? profile.petTypes : [profile.petType || 'Other'];
    return pets.map((pet) => pet === 'Other' && profile.petOtherType?.trim() ? profile.petOtherType.trim() : this.label(pet));
  }
  petSummary(client: BoardClient): string {
    const profile = client.profile;
    const pets = profile.petTypes?.length ? profile.petTypes : [profile.petType || 'Other'];
    return pets.map((pet) => pet === 'Other' && profile.petOtherType?.trim()
      ? profile.petOtherType.trim() : this.label(pet)).join(', ');
  }
  suggest(client: BoardClient) {
    return {
      client: this.showingExamples ? undefined : client.id,
      district: client.profile.districts[0] ? answerLabel(client.profile.districts[0]) : undefined,
      bedrooms: client.profile.bedrooms ?? undefined,
    };
  }
  priorityIcon(code: string) {
    if (/Parking/.test(code)) return 'car';
    if (/Quiet|Away/.test(code)) return 'moon';
    if (/Park|Playground/.test(code)) return 'tree';
    if (/Metro|Transport/.test(code)) return 'train-subway';
    if (/School|University|Study|Kindergarten/.test(code)) return 'graduation-cap';
    if (/Workspace|Office|Company/.test(code)) return 'briefcase';
    if (/Gym/.test(code)) return 'dumbbell';
    if (/Everyday|Supermarket|Pharmacy/.test(code)) return 'basket-shopping';
    if (/Cafe|Restaurant|Meeting|Entertainment/.test(code)) return 'mug-hot';
    if (/Clinic/.test(code)) return 'house-medical';
    if (/Balcony/.test(code)) return 'sun';
    if (/Security/.test(code)) return 'shield-halved';
    if (/Bathroom|Bedroom/.test(code)) return 'bed';
    if (/CityCenter|Location/.test(code)) return 'location-dot';
    if (/Modern|Building/.test(code)) return 'building';
    return 'star';
  }
}
