import { cardNearbyPlaces, NearbyPlace } from '../utils/nearby-places';
import { Component, DoCheck, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { ApartmentService, GeoJsonPolygon } from '../services/apartment.service';
import { FavoriteService } from '../services/favorite.service';
import { AuthService } from '../services/auth.service';
import { Apartment } from '../models/apartment';
import { Agent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ApiLocation, LocationSuggestion } from '../models/location';
import { LocationService } from '../services/location.service';
import { TranslationService } from '../services/translation.service';
import { lockPageScroll, unlockPageScroll } from '../utils/page-scroll-lock';
import { claimEscape, escapeAlreadyHandled } from '../utils/escape-layer';

@Component({
  selector: 'app-main',
  standalone: false,
  templateUrl: './main.html',
  styleUrl: './main.css',
})
export class Main implements OnInit, OnDestroy, DoCheck {
  private pickerScrollLocked = false;

  /** Mobile picker sheets (type / price / bedrooms) freeze the page behind them. */
  ngDoCheck(): void {
    const open =
      (this.propertyTypeOpen || this.budgetOpen || this.bedroomOpen) &&
      typeof window !== 'undefined' &&
      window.innerWidth <= 650;
    if (open === this.pickerScrollLocked) return;
    this.pickerScrollLocked = open;
    if (open) lockPageScroll();
    else if (!this.locationOpen) unlockPageScroll();
  }

  apartments: Apartment[] = [];
  apartmentsForSelectedMode: Apartment[] = [];
  agents: Agent[] = [];
  loading = true;
  agentsLoading = true;
  searchMode: 'rent' | 'buy' = 'rent';
  searchLocation = '';
  private _locationOpen = false;
  get locationOpen(): boolean {
    return this._locationOpen;
  }
  set locationOpen(value: boolean) {
    this._locationOpen = value;
    document.body.classList.toggle('location-picker-open', value);
    if (value) lockPageScroll();
    else unlockPageScroll();
    if (value) this.sheetHeight = null; // reopen at the default height
  }

  /** Mobile bottom sheet: height in px while dragged/snapped, null = CSS default (about half). */
  sheetHeight: number | null = null;
  sheetDragging = false;
  private sheetDragStartY = 0;
  private sheetDragStartHeight = 0;
  private sheetDragMoved = false;
  private sheetLastY = 0;
  private sheetVelocity = 0;

  private sheetBounds(handle: HTMLElement): { min: number; half: number; max: number } {
    const body = handle.closest('.location-modal-body') as HTMLElement | null;
    const total = body?.clientHeight || window.innerHeight * 0.7;
    return { min: 92, half: Math.round(total * 0.46), max: Math.round(total - 8) };
  }

  /** Pressing a price on the map slides the areas sheet down to its handle so the listing card is visible. */
  collapseAreaSheet(): void {
    if (window.innerWidth > 650) return;
    const sheet = document.querySelector<HTMLElement>(
      '.location-picker-dialog .area-picker-column',
    );
    const scroll = sheet?.querySelector<HTMLElement>('.sheet-scroll');
    scroll?.scrollTo({ top: 0, behavior: 'auto' });

    // Freeze the rendered (percentage-based) height first so the following
    // pixel target always animates, including on the first marker press.
    this.sheetHeight = sheet?.getBoundingClientRect().height || this.sheetHeight;
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      this.sheetHeight = 92;
      this.cdr.detectChanges();
    });
  }

  /** Anything shorter than a peek counts as collapsed: taps open it instead of hitting the cards. */
  /** Tapping the map slides the areas sheet down so the map gets the screen. */
  collapseAreaSheetFromMap(): void {
    if (window.innerWidth > 650 || this.areaSheetCollapsed || this.sheetDragging) return;
    this.collapseAreaSheet();
  }

  get areaSheetCollapsed(): boolean {
    return this.sheetHeight !== null && this.sheetHeight <= 180;
  }

  private suppressNextSheetClick = false;

  /** A tap anywhere on the collapsed preview pops the sheet open. */
  expandCollapsedAreaSheet(event: MouseEvent): void {
    if (this.suppressNextSheetClick) {
      this.suppressNextSheetClick = false;
      return;
    }
    if (window.innerWidth > 650 || !this.areaSheetCollapsed) return;
    const sheet = event.currentTarget as HTMLElement;
    const handle = sheet.querySelector<HTMLElement>('.sheet-handle');
    if (!handle) return;
    this.sheetHeight = this.sheetBounds(handle).half;
  }

  sheetPointerDown(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    const sheet = handle.parentElement as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    this.sheetDragging = true;
    this.sheetDragMoved = false;
    this.sheetDragStartY = event.clientY;
    this.sheetLastY = event.clientY;
    this.sheetVelocity = 0;
    this.sheetDragStartHeight = sheet.getBoundingClientRect().height;
  }

  sheetPointerMove(event: PointerEvent): void {
    if (!this.sheetDragging) return;
    const handle = event.currentTarget as HTMLElement;
    const { min, max } = this.sheetBounds(handle);
    const delta = this.sheetDragStartY - event.clientY;
    if (Math.abs(delta) > 4) this.sheetDragMoved = true;
    this.sheetVelocity = this.sheetLastY - event.clientY; // + when moving up
    this.sheetLastY = event.clientY;
    this.sheetHeight = Math.min(max, Math.max(min, this.sheetDragStartHeight + delta));
  }

  sheetPointerUp(event: PointerEvent): void {
    if (!this.sheetDragging) return;
    this.sheetDragging = false;
    const handle = event.currentTarget as HTMLElement;
    const { min, half, max } = this.sheetBounds(handle);
    const current = this.sheetHeight ?? this.sheetDragStartHeight;
    const points = [min, half, max];
    // The click that follows this pointerup bubbles to the sheet; the handle
    // already decided the new height, so the sheet must not re-expand it.
    this.suppressNextSheetClick = true;
    setTimeout(() => (this.suppressNextSheetClick = false), 350);
    if (!this.sheetDragMoved) {
      // A tap toggles between the small and the half height.
      this.sheetHeight = current > half - 20 ? min : half;
      return;
    }
    // Flick: follow the direction of the swipe, otherwise snap to the nearest point.
    const projected = current + this.sheetVelocity * 12;
    this.sheetHeight = points.reduce((best, point) =>
      Math.abs(point - projected) < Math.abs(best - projected) ? point : best,
    );
  }
  locationLoading = false;
  locationError = false;
  showLocationResults = false;
  locationEntries: ApiLocation[] = [];
  selectedLocationArea = '';
  selectedLocationAreas: string[] = [];
  selectedLocationValue = '';
  selectedStreetId: number | null = null;
  streetSearch = '';
  selectedModalStreets: string[] = [];
  selectedModalStreetDetails: Array<{ streetId: number; street: string; district: string }> = [];
  moreAreasOpen = false;
  showAllStreets = false;
  inlineDrawnPolygon: GeoJsonPolygon | null = null;
  drawnStreetSuggestions: Array<{ id: number; label: string; value: string; district: string }> =
    [];
  drawnDetectedArea = '';
  drawnStreetsLoading = false;
  searchPropertyType = '';
  searchBudget = '';
  budgetOpen = false;
  bedroomOpen = false;
  propertyTypeOpen = false;
  budgetCurrency: 'GEL' | 'USD' = 'USD';
  budgetMin: number | null = null;
  budgetMax: number | null = null;
  appliedBudgetMin: number | null = null;
  appliedBudgetMax: number | null = null;
  selectedBudgetRange = '';
  readonly budgetHistogram = [
    5, 7, 6, 8, 9, 10, 12, 14, 18, 24, 31, 38, 45, 52, 48, 55, 58, 62, 57, 54,
    51, 56, 53, 61, 66, 100, 82, 63, 49, 55, 41, 30, 22, 18, 28,
  ];
  readonly budgetRanges = [
    { label: 'Up to $800', min: 0, max: 800 },
    { label: '$800 – $1,500', min: 800, max: 1500 },
    { label: '$1,500 – $3,000', min: 1500, max: 3000 },
    { label: '$3,000 – $5,000', min: 3000, max: 5000 },
  ];
  readonly bedroomOptions = [
    { label: 'Any', value: '' },
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '4', value: '4' },
    { label: '4+', value: '4+' },
  ];
  readonly propertyTypeOptions = ['Apartament', 'House', 'Commercial Place', 'Country house'];
  readonly popularLocationAreas = [
    'Vake',
    'Saburtalo',
    'Vera',
    'Mtatsminda',
    'Didi Digomi',
    'Digomi',
  ];
  readonly featuredLocationAreas = [
    { name: 'Vake', description: 'Premium central area', icon: '/icons/areas/vake-tree.svg' },
    { name: 'Saburtalo', description: 'Central & convenient', icon: '/icons/areas/saburtalo-buildings.svg' },
    { name: 'Vera', description: 'Historic central', icon: '/icons/areas/vera-heritage-house.svg' },
    { name: 'Mtatsminda', description: 'Old city & views', icon: '/icons/areas/mtatsminda-columns.svg' },
  ];
  searchBedrooms = '';
  bedroomTouched = false;
  public advancedFiltersOpen = false;
  drawAreaOpen = false;
  drawAreaInitialized = false;
  private readonly hydratedApartmentIds = new Set<number>();

  constructor(
    private apartmentService: ApartmentService,
    private agentService: AgentService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private locationService: LocationService,
    readonly translationService: TranslationService,
    readonly favoriteService: FavoriteService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private location: Location,
  ) {}

  ngOnDestroy(): void {
    if (this.pickerScrollLocked) unlockPageScroll();
    document.body.classList.remove('location-picker-open');
    if (this._locationOpen) unlockPageScroll();
  }

  ngOnInit(): void {
    this.restoreSearchState();
    this.loadApartments();
    this.loadAgents();
    this.loadLocations();
    this.favoriteService.loadFavorites().subscribe({
      next: () => this.cdr.detectChanges(),
      error: () => undefined,
    });
  }

  toggleFavorite(event: Event, apartment: Apartment): void {
    event.stopPropagation();
    if (!this.authService.isLoggedIn) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/' } });
      return;
    }
    this.favoriteService.toggleFavorite(apartment.id).subscribe({
      next: () => this.cdr.detectChanges(),
      error: (error) => {
        this.cdr.detectChanges();
        console.error('Favorite API error:', error);
      },
    });
  }

  getApartmentGallery(apartment: Apartment): string[] {
    const images = [
      ...(apartment.imageUrls || []),
      apartment.imageUrl,
      ...(apartment.images || []).map((image) => image.url || image.storagePath),
    ]
      .map((image) => toMediaUrl(image))
      .filter((image): image is string => !!image);
    return [...new Set(images)].length ? [...new Set(images)] : ['/property-placeholder.svg'];
  }

  getApartmentCardImage(apartment: Apartment): string {
    return this.getApartmentGallery(apartment)[0];
  }

  get budgetSummary(): string {
    const min = this.appliedBudgetMin;
    const max = this.appliedBudgetMax;
    if (min == null && max == null) return 'Budget';
    if (min != null && max != null)
      return `${min.toLocaleString()} – ${max.toLocaleString()} ${this.budgetCurrency}`;
    if (min != null) return `${min.toLocaleString()}+ ${this.budgetCurrency}`;
    return `Up to ${max!.toLocaleString()} ${this.budgetCurrency}`;
  }

  get budgetSelectionSummary(): string {
    const min = this.budgetMin;
    const max = this.budgetMax;
    if (min != null && max != null)
      return `${min.toLocaleString()} - ${max.toLocaleString()} ${this.budgetCurrency}`;
    if (min != null) return `${min.toLocaleString()}+ ${this.budgetCurrency}`;
    if (max != null) return `Up to ${max.toLocaleString()} ${this.budgetCurrency}`;
    return 'Budget';
  }

  /** Rent budgets are monthly; purchase prices need a much larger slider range. */
  get budgetCap(): number {
    return this.searchMode === 'buy' ? 1_000_000 : 5000;
  }

  get budgetStep(): number {
    return this.searchMode === 'buy' ? 5000 : 50;
  }

  get budgetCapLabel(): string {
    return this.searchMode === 'buy' ? '$1,000,000+' : '$5,000+';
  }

  get budgetMinPercent(): number {
    return Math.min(this.normalizedSliderValue(this.budgetMin ?? 0), this.normalizedSliderValue(this.budgetMax ?? this.budgetCap));
  }

  get budgetMaxPercent(): number {
    return Math.max(this.normalizedSliderValue(this.budgetMin ?? 0), this.normalizedSliderValue(this.budgetMax ?? this.budgetCap));
  }

  setBudgetMin(value: number | null): void {
    const maximum = Number(this.budgetMax ?? this.budgetCap);
    this.budgetMin = value == null ? null : Math.min(maximum, Math.max(0, Number(value)));
    this.selectedBudgetRange = '';
  }

  setBudgetMax(value: number | null): void {
    const minimum = Number(this.budgetMin ?? 0);
    this.budgetMax = value == null ? null : Math.max(minimum, Math.min(this.budgetCap, Number(value)));
    this.selectedBudgetRange = '';
  }

  private normalizedSliderValue(value: number | null): number {
    return Math.min(100, Math.max(0, (Number(value || 0) / this.budgetCap) * 100));
  }

  get bedroomSummary(): string {
    if (!this.bedroomTouched || !this.searchBedrooms) return 'Bedrooms';
    const values = this.searchBedroomValues;
    if (values.length === 1) return values[0] === '1' ? '1 Bedroom' : `${values[0]} Bedrooms`;
    return `${values.join(', ')} Bedrooms`;
  }

  get searchBedroomValues(): string[] {
    return this.searchBedrooms.split(',').filter(Boolean);
  }

  isBedroomSelected(value: string): boolean {
    return this.searchBedroomValues.includes(value);
  }

  /** Closes only the topmost open layer per press (see utils/escape-layer). */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (escapeAlreadyHandled(event)) return;
    const close = (fn: () => void) => { claimEscape(event); fn(); };
    if (this.drawAreaOpen) return close(() => this.closeDrawArea());
    if (this.locationOpen) return close(() => this.cancelLocationPicker());
    if (this.budgetOpen || this.bedroomOpen || this.propertyTypeOpen)
      return close(() => (this.budgetOpen = this.bedroomOpen = this.propertyTypeOpen = false));
  }

  @HostListener('document:click')
  closeBudget(): void {
    this.budgetOpen = false;
    this.bedroomOpen = false;
    this.propertyTypeOpen = false;
    this.locationOpen = false;
  }

  toggleSearchMenu(menu: 'location' | 'propertyType' | 'budget' | 'bedroom'): void {
    const willOpen = !this.searchMenuOpen(menu);
    this.locationOpen = false;
    this.propertyTypeOpen = false;
    this.budgetOpen = false;
    this.bedroomOpen = false;
    if (willOpen) {
      if (menu === 'location') this.locationOpen = true;
      if (menu === 'propertyType') this.propertyTypeOpen = true;
      if (menu === 'budget') this.budgetOpen = true;
      if (menu === 'bedroom') this.bedroomOpen = true;
      if (menu !== 'location') this.revealSearchPopover();
    }
  }

  /**
   * Wider screens (small laptops, tablets) open the pickers as dropdowns below the search bar,
   * which can land past the bottom of the window. Scroll just enough to show the whole menu.
   * Phones (<= 650px) use a fixed bottom sheet and need nothing.
   */
  private revealSearchPopover(): void {
    if (typeof window === 'undefined' || window.innerWidth <= 650) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const popover = document.querySelector<HTMLElement>('.property-type-menu, .main-budget-popover, .bedroom-popover');
      if (!popover) return;
      const rect = popover.getBoundingClientRect();
      const margin = 16;
      const overflow = rect.bottom + margin - window.innerHeight;
      if (overflow <= 0) return;
      // Never scroll the popover's own top (and the field above it) off the screen.
      const room = Math.max(0, rect.top - 90);
      window.scrollBy({ top: Math.min(overflow, room), behavior: 'smooth' });
    }));
  }

  private searchMenuOpen(menu: 'location' | 'propertyType' | 'budget' | 'bedroom'): boolean {
    return menu === 'location'
      ? this.locationOpen
      : menu === 'propertyType'
        ? this.propertyTypeOpen
        : menu === 'budget'
          ? this.budgetOpen
          : this.bedroomOpen;
  }

  selectBudgetRange(range: { label: string; min: number; max: number }): void {
    this.selectedBudgetRange = range.label;
    this.budgetCurrency = 'USD';
    this.budgetMin = range.min;
    this.budgetMax = range.max;
  }

  applyBudget(): void {
    this.appliedBudgetMin = this.normalizeBudget(this.budgetMin);
    this.appliedBudgetMax = this.normalizeBudget(this.budgetMax);
    this.searchBudget = this.appliedBudgetMax?.toString() || '';
    this.budgetOpen = false;
  }

  resetBudget(): void {
    this.budgetMin = null;
    this.budgetMax = null;
    this.appliedBudgetMin = null;
    this.appliedBudgetMax = null;
    this.searchBudget = '';
    this.selectedBudgetRange = '';
    this.budgetOpen = false;
  }

  selectBedrooms(value: string): void {
    this.bedroomTouched = true;
    if (!value) {
      this.searchBedrooms = '';
      this.bedroomOpen = false;
      return;
    }

    const selected = new Set(this.searchBedroomValues);
    selected.has(value) ? selected.delete(value) : selected.add(value);
    this.searchBedrooms = this.bedroomOptions
      .map((option) => option.value)
      .filter((optionValue) => optionValue && selected.has(optionValue))
      .join(',');
  }

  selectPropertyType(value: string): void {
    this.searchPropertyType = value;
    this.propertyTypeOpen = false;
  }

  selectSearchMode(mode: 'rent' | 'buy'): void {
    // Rent (monthly) and buy (purchase) budgets use different scales; never carry one into the other.
    if (mode !== this.searchMode) this.resetBudget();
    this.searchMode = mode;
    this.updateApartmentsForSelectedMode();
    this.hydrateHomepageGalleries();
  }

  get areaSuggestions(): LocationSuggestion[] {
    const query = this.searchLocation.trim().toLowerCase();
    const language = this.locationService.languageForQuery(this.searchLocation);
    return this.locationEntries
      .filter((entry) => entry.city === 'Tbilisi')
      .filter(
        (entry) =>
          !query ||
          entry.district.toLowerCase().includes(query) ||
          entry.region.toLowerCase().includes(query) ||
          this.locationService.districtName(entry, language).toLowerCase().includes(query) ||
          this.locationService.regionName(entry, language).toLowerCase().includes(query),
      )
      .sort(
        (left, right) =>
          this.locationAreaRank(left.district) - this.locationAreaRank(right.district),
      )
      .slice(0, 8)
      .map((entry) => ({
        id: entry.id,
        label: this.locationService.districtName(entry, language),
        value: entry.district,
        type: 'Area',
        city: this.locationService.cityName(entry, language),
      }));
  }

  get streetSuggestions(): LocationSuggestion[] {
    const query = this.searchLocation.trim().toLowerCase();
    const language = this.locationService.languageForQuery(this.searchLocation);
    if (!this.selectedLocationArea && query.length < 2) return [];
    const suggestions: LocationSuggestion[] = [];

    for (const entry of this.locationEntries.filter(
      (item) =>
        item.city === 'Tbilisi' &&
        (!this.selectedLocationArea || item.district === this.selectedLocationArea),
    )) {
      for (const street of this.locationService.streetNames(entry, language)) {
        if (
          this.selectedLocationArea ||
          street.value.toLowerCase().includes(query) ||
          street.label.toLowerCase().includes(query)
        ) {
          suggestions.push({
            id: street.id,
            label: street.label,
            value: street.value,
            type: 'Street',
            city: this.locationService.cityName(entry, language),
            district: this.locationService.districtName(entry, language),
          });
          if (suggestions.length === 8) return suggestions;
        }
      }
    }
    return suggestions;
  }

  get hasLocationSuggestions(): boolean {
    return !!(this.areaSuggestions.length || this.streetSuggestions.length);
  }

  get streetGroupTitle(): string {
    if (!this.selectedLocationArea) return 'Streets';
    const entry = this.locationEntries.find((item) => item.district === this.selectedLocationArea);
    const language = this.locationService.languageForQuery(this.searchLocation);
    const area = entry
      ? this.locationService.districtName(entry, language)
      : this.selectedLocationArea;
    return language === 'ka' ? `${area} — ქუჩები` : `Streets in ${area}`;
  }

  locationText(english: string, georgian: string): string {
    return this.locationService.languageForQuery(this.searchLocation) === 'ka' ? georgian : english;
  }

  openLocationSearch(): void {
    this.toggleSearchMenu('location');
  }

  public get modalStreetSuggestions(): LocationSuggestion[] {
    if (this.streetSearch.trim().length < 2) return [];
    if (this.inlineDrawnPolygon && this.drawnStreetSuggestions.length) {
      const query = this.streetSearch.trim().toLowerCase();
      const streets = this.drawnStreetSuggestions
        .filter(
          (street) =>
            !query ||
            street.label.toLowerCase().includes(query) ||
            street.value.toLowerCase().includes(query),
        )
        .map((street) => ({
          ...street,
          type: 'Street' as const,
          city: 'Tbilisi',
          district: this.drawnDetectedArea || this.selectedLocationArea,
        }));
      return streets.slice(0, 6);
    }
    if (!this.selectedLocationAreas.length) return [];
    const query = this.streetSearch.trim().toLowerCase();
    const streetGroups = this.selectedLocationAreas.map((selectedArea) =>
      this.locationEntries
        .filter(
          (entry) =>
            entry.district.toLowerCase() === selectedArea.toLowerCase() ||
            this.locationService.districtName(entry, 'en').toLowerCase() ===
              selectedArea.toLowerCase() ||
            this.locationService.districtName(entry, 'ka').toLowerCase() ===
              selectedArea.toLowerCase(),
        )
        .flatMap((entry) =>
          this.locationService.streetNames(entry, 'ka').map((street) => ({
            ...street,
            city: this.locationService.cityName(entry, 'en'),
            district: selectedArea,
          })),
        )
        .filter(
          (street) =>
            !query ||
            street.label.toLowerCase().includes(query) ||
            street.value.toLowerCase().includes(query),
        ),
    );
    const streets = Array.from(
      { length: Math.max(0, ...streetGroups.map((group) => group.length)) },
      (_, index) => streetGroups.map((group) => group[index]).filter((street) => !!street),
    )
      .flat()
      .filter(
        (street, index, list) =>
          list.findIndex(
            (item) => item.value === street.value && item.district === street.district,
          ) === index,
      )
      .sort((first, second) => first.label.localeCompare(second.label, 'ka'));
    return streets.slice(0, 6).map((street) => ({
      id: street.id,
      label: street.label === street.value ? street.value : `${street.label} — ${street.value}`,
      value: street.value,
      type: 'Street',
      city: street.city,
      district: street.district,
    }));
  }

  public get streetAreaTitle(): string {
    if (this.inlineDrawnPolygon && this.drawnDetectedArea)
      return `Streets in ${this.drawnDetectedArea}`;
    if (!this.selectedLocationAreas.length) return 'Streets in selected areas';
    return `Streets in ${this.selectedLocationAreas.join(' + ')}`;
  }

  public get apiTbilisiAreas(): string[] {
    const featured = new Set(this.featuredLocationAreas.map((area) => area.name.toLowerCase()));
    return [
      ...new Set(
        this.locationEntries
          .filter((entry) => entry.city === 'Tbilisi')
          .map((entry) => entry.district)
          .filter(
            (area) =>
              !!area &&
              area !== 'System.Collections.Hashtable' &&
              /[A-Za-z]/.test(area) &&
              !/[\u10A0-\u10FF]/.test(area),
          )
          .filter((area) => !featured.has(area.toLowerCase())),
      ),
    ].sort((left, right) => {
      const rankDifference = this.locationAreaRank(left) - this.locationAreaRank(right);
      return rankDifference || left.localeCompare(right, 'en');
    });
  }

  public get visibleTbilisiAreas(): string[] {
    return this.apiTbilisiAreas.slice(0, 12);
  }

  public get additionalTbilisiAreas(): string[] {
    return this.apiTbilisiAreas.slice(12);
  }

  public get selectedAreaDescription(): string {
    return (
      this.featuredLocationAreas.find((area) => area.name === this.selectedLocationArea)
        ?.description || 'Explore homes, streets and neighborhoods in this area.'
    );
  }

  public chooseAreaForModal(area: string): void {
    if (this.isAreaSelected(area)) {
      this.removeModalArea(area);
      return;
    }
    this.selectedLocationAreas = [...this.selectedLocationAreas, area];
    this.selectedLocationArea = area;
    this.showAllStreets = false;
    this.inlineDrawnPolygon = null;
    this.drawnDetectedArea = '';
    this.streetSearch = '';
  }

  public isAreaSelected(area: string): boolean {
    return this.selectedLocationAreas.includes(area);
  }

  public removeModalArea(area: string): void {
    this.selectedLocationAreas = this.selectedLocationAreas.filter((item) => item !== area);
    this.selectedModalStreetDetails = this.selectedModalStreetDetails.filter(
      (item) => item.district !== area,
    );
    this.selectedModalStreets = this.selectedModalStreetDetails.map((item) => item.street);
    if (this.selectedLocationArea === area) {
      this.selectedLocationArea = this.selectedLocationAreas.at(-1) || '';
      this.inlineDrawnPolygon = null;
    }
  }

  public isStreetSelected(street: string): boolean {
    return this.selectedModalStreets.includes(street);
  }

  public toggleModalStreet(street: LocationSuggestion): void {
    if (this.isStreetSelected(street.label)) {
      this.selectedModalStreets = this.selectedModalStreets.filter((item) => item !== street.label);
      this.selectedModalStreetDetails = this.selectedModalStreetDetails.filter(
        (item) => item.street !== street.label,
      );
      this.selectedStreetId = this.selectedModalStreetDetails.at(-1)?.streetId ?? null;
    } else {
      if (!street.id) return;
      const district = street.district?.trim() || '';
      if (
        district &&
        !this.selectedLocationAreas.some(
          (area) => area.toLowerCase() === district.toLowerCase(),
        )
      ) {
        this.selectedLocationAreas = [...this.selectedLocationAreas, district];
      }
      if (district) this.selectedLocationArea = district;
      this.inlineDrawnPolygon = null;
      this.drawnDetectedArea = '';
      this.selectedModalStreets = [...this.selectedModalStreets, street.label];
      this.selectedModalStreetDetails = [
        ...this.selectedModalStreetDetails,
        { streetId: street.id, street: street.label, district },
      ];
      this.selectedStreetId = street.id;
    }
  }

  public clearModalLocation(): void {
    this.selectedLocationArea = '';
    this.selectedLocationAreas = [];
    this.selectedModalStreets = [];
    this.selectedModalStreetDetails = [];
    this.selectedStreetId = null;
    this.streetSearch = '';
    this.inlineDrawnPolygon = null;
  }

  public onInlinePolygon(polygon: GeoJsonPolygon | null): void {
    this.inlineDrawnPolygon = polygon;
    this.drawnStreetsLoading = !!polygon;
    if (!polygon) {
      this.drawnStreetSuggestions = [];
      this.drawnDetectedArea = '';
    }
  }

  public onDrawnStreets(
    streets: Array<{ id: number; label: string; value: string; district: string }>,
  ): void {
    this.drawnStreetSuggestions = streets;
    this.drawnStreetsLoading = false;
    this.cdr.detectChanges();
  }

  public onDetectedDrawnArea(area: string): void {
    this.drawnDetectedArea = area;
    if (area) {
      this.selectedLocationArea = area;
      this.selectedLocationAreas = [area];
    }
    this.selectedModalStreetDetails = [];
    this.selectedModalStreets = [];
    this.cdr.detectChanges();
  }

  public cancelLocationPicker(): void {
    this.locationOpen = false;
  }

  public applyModalLocation(): void {
    if (!this.selectedLocationAreas.length && !this.inlineDrawnPolygon) return;
    const effectiveAreas =
      this.inlineDrawnPolygon && this.drawnDetectedArea
        ? [this.drawnDetectedArea]
        : this.selectedLocationAreas;
    this.searchLocation = effectiveAreas.length
      ? this.selectedModalStreets.length
        ? `${effectiveAreas.join(', ')}: ${this.selectedModalStreets.join(', ')}`
        : effectiveAreas.join(', ')
      : 'Selected map area';
    this.selectedLocationValue = effectiveAreas.length
      ? this.selectedModalStreets.length
        ? this.selectedModalStreets.join(',')
        : effectiveAreas.join(',')
      : '';
    this.selectedStreetId = this.selectedModalStreetDetails.at(-1)?.streetId ?? null;
    if (this.inlineDrawnPolygon && this.drawnDetectedArea) {
      sessionStorage.setItem('white-tower-drawn-area', JSON.stringify(this.inlineDrawnPolygon));
    } else {
      sessionStorage.removeItem('white-tower-drawn-area');
      this.inlineDrawnPolygon = null;
    }
    this.locationOpen = false;
  }

  focusLocationInput(input: HTMLInputElement): void {
    input.focus();
  }

  selectPopularArea(area: string): void {
    const entry = this.locationEntries.find(
      (item) => item.district.toLowerCase() === area.toLowerCase(),
    );
    this.selectLocation({
      id: entry?.id,
      label: entry ? this.locationService.districtName(entry, 'en') : area,
      value: entry?.district || area,
      type: 'Area',
      city: entry ? this.locationService.cityName(entry, 'en') : 'Tbilisi',
    });
  }

  chooseLocationByLabel(label: string): void {
    for (const entry of this.locationEntries) {
      const street = this.locationService
        .streetNames(entry, 'en')
        .find((item) => item.label.toLowerCase().includes(label.toLowerCase()));
      if (street) {
        this.selectLocation({
          id: street.id,
          label: street.label,
          value: street.value,
          type: 'Street',
          city: this.locationService.cityName(entry, 'en'),
          district: this.locationService.districtName(entry, 'en'),
        });
        return;
      }
    }
    this.searchLocation = label;
    this.selectedLocationValue = label;
    this.locationOpen = false;
  }

  showAllTbilisiAreas(): void {
    this.searchLocation = '';
    this.showLocationResults = true;
  }

  selectLocation(suggestion: LocationSuggestion): void {
    this.searchLocation = suggestion.label;
    this.selectedLocationValue = suggestion.value || suggestion.label;
    this.selectedStreetId = suggestion.type === 'Street' && suggestion.id ? suggestion.id : null;
    this.selectedLocationArea = suggestion.type === 'Area' ? this.selectedLocationValue : '';
    this.showLocationResults = false;
    this.locationOpen = false;
  }

  onLocationInput(): void {
    this.selectedLocationArea = '';
    this.selectedLocationValue = '';
    this.selectedStreetId = null;
    this.showLocationResults = true;
    this.locationOpen = true;
  }

  private loadLocations(): void {
    this.locationLoading = true;
    this.locationService.getLocations().subscribe({
      next: (locations) => {
        this.locationEntries = locations;
        this.translationService.registerTranslations(
          'ka',
          locations.map((location) => ({
            source: this.locationService.districtName(location, 'en'),
            translation: this.locationService.districtName(location, 'ka'),
          })),
        );
        this.locationLoading = false;
        this.locationError = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.locationLoading = false;
        this.locationError = true;
        this.cdr.detectChanges();
      },
    });
  }

  private locationAreaRank(district: string): number {
    const popularAreas = [
      'Vake', 'Saburtalo', 'Vera', 'Mtatsminda',
      'Didi Digomi', 'Digomi', 'Didube', 'Avlabari',
      'Isani', 'Gldani', 'Chugureti', 'Bagebi',
      'Ortachala', 'Nadzaladevi', 'Krtsanisi', 'Vashlijvari',
      'Sololaki', 'Samgori', 'Avchala', 'Abanotubani',
    ];
    const index = popularAreas.findIndex(
      (area) => area.toLowerCase() === district.trim().toLowerCase(),
    );
    return index === -1 ? popularAreas.length : index;
  }

  get topApartments(): Apartment[] {
    return this.apartmentsForSelectedMode
      .filter((apartment) => this.isDisplayableApartment(apartment))
      .slice(0, 4);
  }

  loadApartments(): void {
    this.loading = true;

    this.apartmentService.getApartments().subscribe({
      next: (data) => {
        this.apartments = data.map((apartment) => {
          const current = this.apartments.find((item) => item.id === apartment.id);
          return current && this.getApartmentGallery(current).length > 1
            ? { ...apartment, images: current.images, imageUrls: current.imageUrls, imageUrl: current.imageUrl }
            : apartment;
        });
        this.updateApartmentsForSelectedMode();
        this.loading = false;
        this.cdr.detectChanges();
        this.hydrateHomepageGalleries();
      },
      error: (err) => {
        console.error('Apartment API error:', err);
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private hydrateHomepageGalleries(): void {
    // Gallery hydration fires one detail request per card. Keep it off the
    // critical path so first paint isn't blocked by API round trips.
    const run = (): void => {
      for (const apartment of this.topApartments) {
        if (this.hydratedApartmentIds.has(apartment.id)) continue;
        this.hydratedApartmentIds.add(apartment.id);

        this.apartmentService.getApartment(apartment.id).subscribe({
          next: (detailedApartment) => {
            this.hydratedApartmentIds.delete(apartment.id);
            const index = this.apartments.findIndex((item) => item.id === detailedApartment.id);
            if (index === -1) return;
            this.apartments = [
              ...this.apartments.slice(0, index),
              detailedApartment,
              ...this.apartments.slice(index + 1),
            ];
            this.cdr.detectChanges();
          },
          error: () => this.hydratedApartmentIds.delete(apartment.id),
        });
      }
    };

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === 'function') {
      idle.call(window, run, { timeout: 2500 });
    } else {
      window.setTimeout(run, 800);
    }
  }

  loadAgents(): void {
    this.agentsLoading = true;

    this.agentService.getAgents().subscribe({
      next: (data) => {
        this.agents = data.slice(0, 4);
        this.agentsLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Agents API error:', err);
        this.agents = [];
        this.agentsLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  getAgentName(agent: Agent): string {
    return agent.fullName || agent.name || agent.userName || 'Agent';
  }

  getAgentImage(agent: Agent): string {
    return (
      toMediaUrl(agent.profilePictureUrl || agent.profilePicture || agent.avatarUrl) ||
      '/agent1.jpg'
    );
  }

  getAgentRating(agent: Agent): number {
    return agent.averageRating || agent.rating || 0;
  }

  getClosedDeals(agent: Agent): number {
    return agent.closedDeals || 0;
  }

  getAgentLocation(agent: Agent): string {
    return agent.location || 'Tbilisi, Georgia';
  }

  fixAgentImage(event: Event): void {
    tryNextProfileImageUrl(event);
  }

  getApartmentTitle(apartment: Apartment): string {
    return apartment.title?.trim() || `Apartment #${apartment.id}`;
  }

  /** Verified badge only when the uploading agent explicitly ticked "Verified listing". */
  /** Three nearby places that actually have data; missing ones are replaced by the next available. */
  nearbyPlaces(apartment: Apartment): NearbyPlace[] {
    return cardNearbyPlaces(apartment);
  }

  isVerifiedListing(apartment: Apartment): boolean {
    return /(?:^|[|\r\n])\s*Verified listing:\s*Yes\b/i.test(apartment.description || '');
  }

  isExclusiveListing(apartment: Apartment): boolean {
    return /(?:^|[|\r\n])\s*Listing plan:\s*Velven Exclusive\b/i.test(apartment.description || '');
  }

  getApartmentLocationLabel(apartment: Apartment): string {
    const city = apartment.city?.trim() || 'Tbilisi';
    let district = apartment.district?.trim() || '';

    if (!district) {
      const locationText = [apartment.address, apartment.region, apartment.street]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchedArea = this.locationEntries.find((entry) => {
        const names = [
          entry.district,
          this.locationService.districtName(entry, 'en'),
          this.locationService.districtName(entry, 'ka'),
        ]
          .filter(Boolean)
          .map((name) => name.toLowerCase());
        if (names.some((name) => locationText.includes(name))) return true;
        return this.locationService
          .streetNames(entry, 'en')
          .some(
            (street) =>
              locationText.includes(street.label.toLowerCase()) ||
              locationText.includes(street.value.toLowerCase()),
          );
      });
      district = matchedArea ? this.locationService.districtName(matchedArea, 'en') : '';
    }

    const language = this.translationService.language$.value;
    const cityLabel = language === 'ka' && /^tbilisi$/i.test(city) ? 'თბილისი' : city;
    if (!district) return cityLabel;
    const matchedDistrict = this.locationEntries.find(
      (entry) =>
        entry.district.toLowerCase() === district.toLowerCase() ||
        this.locationService.districtName(entry, 'ka').toLowerCase() === district.toLowerCase(),
    );
    const districtLabel = matchedDistrict
      ? this.locationService.districtName(matchedDistrict, language)
      : district;
    return `${cityLabel} ${districtLabel}`;
  }

  getApartmentDescription(apartment: Apartment): string {
    return apartment.description?.trim() || 'No description provided.';
  }

  /** Search criteria live in this page's own URL (written just before leaving for results),
   *  so browser Back / refresh brings the same selections back. */
  private restoreSearchState(): void {
    const q = this.route.snapshot.queryParamMap;
    const mode = q.get('mode');
    if (mode === 'rent' || mode === 'buy') this.searchMode = mode;
    const location = q.get('location');
    if (location) {
      this.selectedLocationValue = location;
      this.searchLocation = q.get('label') || location;
    }
    const streetId = Number(q.get('street_id'));
    if (streetId > 0) this.selectedStreetId = streetId;
    this.searchPropertyType = q.get('propertyType') || '';
    const currency = q.get('currency');
    if (currency === 'GEL' || currency === 'USD') this.budgetCurrency = currency;
    const numberParam = (key: string) => {
      const raw = q.get(key);
      return raw != null && raw !== '' && !isNaN(+raw) ? +raw : null;
    };
    this.budgetMin = this.appliedBudgetMin = numberParam('budgetMin');
    this.budgetMax = this.appliedBudgetMax = numberParam('budgetMax');
    this.searchBudget = this.appliedBudgetMax?.toString() || '';
    const bedrooms = q.get('bedrooms');
    if (bedrooms) {
      this.searchBedrooms = bedrooms;
      this.bedroomTouched = true;
    }
  }

  private saveSearchState(): void {
    const path = this.router.url.split(/[?#]/)[0] || '/';
    const hasBudget = this.appliedBudgetMin != null || this.appliedBudgetMax != null;
    const tree = this.router.createUrlTree([path], {
      queryParams: {
        mode: this.searchMode !== 'rent' ? this.searchMode : null,
        location: this.selectedLocationValue || null,
        label:
          this.selectedLocationValue && this.searchLocation !== this.selectedLocationValue
            ? this.searchLocation
            : null,
        street_id: this.selectedStreetId || null,
        propertyType: this.searchPropertyType || null,
        budgetMin: this.appliedBudgetMin,
        budgetMax: this.appliedBudgetMax,
        currency: hasBudget ? this.budgetCurrency : null,
        bedrooms: this.searchBedrooms || null,
      },
    });
    this.location.replaceState(this.router.serializeUrl(tree));
  }

  searchHomes(): void {
    this.saveSearchState();
    const useDrawnArea =
      !!this.inlineDrawnPolygon && !!this.drawnDetectedArea && !this.selectedLocationValue;
    void this.router.navigate(['/ExploreProperty'], {
      queryParams: {
        mode: this.searchMode,
        area: useDrawnArea ? 'drawn' : null,
        location: useDrawnArea
          ? null
          : this.selectedLocationValue || this.searchLocation || null,
        street_id: this.selectedStreetId || null,
        locationLanguage: this.locationService.languageForQuery(this.searchLocation),
        propertyType: this.searchPropertyType || null,
        budget: this.toUsd(this.appliedBudgetMax),
        budgetMin: this.toUsd(this.appliedBudgetMin),
        budgetCurrency: this.budgetCurrency,
        bedrooms: this.searchBedrooms || null,
      },
    });
  }

  useQuickFilter(filter: string): void {
    void this.router.navigate(['/ExploreProperty'], {
      queryParams: { mode: this.searchMode, feature: filter },
    });
  }

  public toggleAdvancedFilters(): void {
    this.advancedFiltersOpen = !this.advancedFiltersOpen;
  }

  public openAiHomeMatch(): void {
    void this.router.navigate(['/ai-home-match']);
  }

  openDrawArea(): void {
    this.locationOpen = false;
    this.drawAreaInitialized = true;
    this.drawAreaOpen = true;
    document.body.style.overflow = 'hidden';
  }

  closeDrawArea(): void {
    this.drawAreaOpen = false;
    document.body.style.overflow = '';
  }

  applyDrawnArea(polygon: GeoJsonPolygon): void {
    sessionStorage.setItem('white-tower-drawn-area', JSON.stringify(polygon));
    this.closeDrawArea();
    this.saveSearchState();
    void this.router.navigate(['/ExploreProperty'], {
      queryParams: {
        mode: polygon.searchMode || this.searchMode,
        area: 'drawn',
        location: polygon.streetName || null,
        street_id: polygon.streetId || null,
        propertyType: polygon.propertyType || this.searchPropertyType || null,
        budget: polygon.budget || this.toUsd(this.appliedBudgetMax),
        bedrooms: polygon.bedrooms || this.searchBedrooms || null,
      },
    });
  }

  private isDisplayableApartment(apartment: Apartment): boolean {
    return !!apartment.title?.trim() && Number(apartment.price) > 0;
  }

  private matchesSearchMode(apartment: Apartment): boolean {
    const text = `${apartment.title || ''} ${apartment.description || ''}`.toLowerCase();
    const deal = text.match(/deal:\s*([^|\n\r]+)/i)?.[1]?.trim() || '';
    const listingType = deal || text;
    const isForSale = /\b(for\s+sale|sale|buy)\b|იყიდება|продаж/i.test(listingType);
    const isForRent = /\b(for\s+rent|rent|daily\s+rent|lease)\b|ქირავდება|аренд/i.test(listingType);

    return this.searchMode === 'buy' ? isForSale : isForRent;
  }

  private updateApartmentsForSelectedMode(): void {
    this.apartmentsForSelectedMode = this.apartments.filter((apartment) =>
      this.matchesSearchMode(apartment),
    );
  }

  private normalizeBudget(value: number | null): number | null {
    const normalized = Number(value);
    return value == null || !Number.isFinite(normalized) || normalized < 0 ? null : normalized;
  }

  private toUsd(value: number | null): number | null {
    if (value == null) return null;
    return this.budgetCurrency === 'GEL' ? Math.round(value / 2.7) : value;
  }
}
