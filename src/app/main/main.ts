import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { ApartmentService, GeoJsonPolygon } from '../services/apartment.service';
import { FavoriteService } from '../services/favorite.service';
import { AuthService } from '../services/auth.service';
import { Apartment } from '../models/apartment';
import { Agent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';
import { Router } from '@angular/router';
import { ApiLocation, LocationSuggestion } from '../models/location';
import { LocationService } from '../services/location.service';

@Component({
  selector: 'app-main',
  standalone: false,
  templateUrl: './main.html',
  styleUrl: './main.css',
})
export class Main implements OnInit {
  apartments: Apartment[] = [];
  agents: Agent[] = [];
  loading = true;
  agentsLoading = true;
  searchMode: 'rent' | 'buy' = 'rent';
  searchLocation = '';
  locationOpen = false;
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
  drawnStreetSuggestions: Array<{ id: number; label: string; value: string; district: string }> = [];
  drawnDetectedArea = '';
  drawnStreetsLoading = false;
  searchPropertyType = '';
  searchBudget = '';
  budgetOpen = false;
  bedroomOpen = false;
  bedroomStep: 'rooms' | 'bedrooms' = 'rooms';
  propertyTypeOpen = false;
  budgetCurrency: 'GEL' | 'USD' = 'GEL';
  budgetMin: number | null = 0;
  budgetMax: number | null = 5000;
  appliedBudgetMin: number | null = null;
  appliedBudgetMax: number | null = null;
  selectedBudgetRange = '';
  readonly budgetRanges = [
    { label: 'Up to $800', min: 0, max: 800 },
    { label: '$800 – $1,500', min: 800, max: 1500 },
    { label: '$1,500 – $3,000', min: 1500, max: 3000 },
    { label: '$3,000 – $5,000', min: 3000, max: 5000 },
  ];
  readonly roomOptions = [1, 2, 3, 4, 5].map((value) => ({
    label: `${value} ${value === 1 ? 'Room' : 'Rooms'}`,
    value: String(value),
    icon: 'fa-solid fa-door-open',
  }));
  readonly bedroomOptions = [
    { label: '1 Bedroom', value: '1', icon: 'fa-solid fa-bed' },
    { label: '2 Bedrooms', value: '2', icon: 'fa-solid fa-bed' },
    { label: '3 Bedrooms', value: '3', icon: 'fa-solid fa-bed' },
    { label: '4 Bedrooms', value: '4', icon: 'fa-solid fa-bed' },
    { label: '4+ Bedrooms', value: '4+', icon: 'fa-solid fa-layer-group' },
  ];
  readonly propertyTypeOptions = ['Apartament', 'House', 'Commercial Place', 'Country house'];
  readonly popularLocationAreas = ['Vake', 'Saburtalo', 'Vera', 'Mtatsminda', 'Didi Digomi', 'Digomi'];
  readonly featuredLocationAreas = [
    { name: 'Vake', description: 'Premium central area', icon: 'fa-regular fa-building' },
    { name: 'Saburtalo', description: 'Central & convenient', icon: 'fa-solid fa-city' },
    { name: 'Vera', description: 'Historic central', icon: 'fa-solid fa-house-chimney' },
    { name: 'Mtatsminda', description: 'Old city & views', icon: 'fa-solid fa-landmark' },
  ];
  readonly allLocationAreas = ['Didube', 'Digomi', 'Didi Digomi', 'Gldani', 'Nadzaladevi', 'Isani', 'Samgori', 'Avlabari', 'Sololaki', 'Chugureti', 'Krtsanisi', 'Vashlijvari'];
  searchBedrooms = '';
  searchRooms = '';
  public advancedFiltersOpen = false;
  drawAreaOpen = false;
  drawAreaInitialized = false;

  constructor(
    private apartmentService: ApartmentService,
    private agentService: AgentService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private locationService: LocationService,
    readonly favoriteService: FavoriteService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
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

  get budgetSummary(): string {
    const min = this.appliedBudgetMin;
    const max = this.appliedBudgetMax;
    if (min == null && max == null) return 'Any budget';
    if (min != null && max != null) return `${min.toLocaleString()} – ${max.toLocaleString()} ${this.budgetCurrency}`;
    if (min != null) return `${min.toLocaleString()}+ ${this.budgetCurrency}`;
    return `Up to ${max!.toLocaleString()} ${this.budgetCurrency}`;
  }

  get bedroomSummary(): string {
    if (!this.searchRooms) return 'Rooms';
    const rooms = `${this.searchRooms} ${this.searchRooms === '1' ? 'Room' : 'Rooms'}`;
    if (!this.searchBedrooms) return rooms;
    const bedrooms = `${this.searchBedrooms} ${this.searchBedrooms === '1' ? 'Bedroom' : 'Bedrooms'}`;
    return `${rooms}, ${bedrooms}`;
  }

  get availableBedroomOptions() {
    const rooms = Number(this.searchRooms || 0);
    return this.bedroomOptions.filter((option) => Number(option.value.replace('+', '')) <= rooms);
  }

  get budgetMinPercent(): number {
    return Math.min(this.normalizedSliderValue(this.budgetMin), this.normalizedSliderValue(this.budgetMax));
  }

  get budgetMaxPercent(): number {
    return Math.max(this.normalizedSliderValue(this.budgetMin), this.normalizedSliderValue(this.budgetMax));
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
    }
  }

  private searchMenuOpen(menu: 'location' | 'propertyType' | 'budget' | 'bedroom'): boolean {
    return menu === 'location' ? this.locationOpen
      : menu === 'propertyType' ? this.propertyTypeOpen
      : menu === 'budget' ? this.budgetOpen
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
    this.budgetMin = 0;
    this.budgetMax = 5000;
    this.appliedBudgetMin = null;
    this.appliedBudgetMax = null;
    this.searchBudget = '';
    this.selectedBudgetRange = '';
    this.budgetOpen = false;
  }

  selectRooms(value: string): void {
    this.searchRooms = value;
    this.searchBedrooms = '';
    this.bedroomStep = 'bedrooms';
  }

  selectBedrooms(value: string): void {
    this.searchBedrooms = value;
    this.bedroomOpen = false;
  }

  clearBedrooms(): void {
    this.searchRooms = '';
    this.searchBedrooms = '';
    this.bedroomStep = 'rooms';
    this.bedroomOpen = false;
  }

  selectPropertyType(value: string): void {
    this.searchPropertyType = value;
    this.propertyTypeOpen = false;
  }

  get areaSuggestions(): LocationSuggestion[] {
    const query = this.searchLocation.trim().toLowerCase();
    const language = this.locationService.languageForQuery(this.searchLocation);
    return this.locationEntries
      .filter((entry) => entry.city === 'Tbilisi')
      .filter((entry) =>
        !query ||
        entry.district.toLowerCase().includes(query) ||
        entry.region.toLowerCase().includes(query) ||
        this.locationService.districtName(entry, language).toLowerCase().includes(query) ||
        this.locationService.regionName(entry, language).toLowerCase().includes(query),
      )
      .sort((left, right) => this.locationAreaRank(left.district) - this.locationAreaRank(right.district))
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

    for (const entry of this.locationEntries.filter((item) =>
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
    const area = entry ? this.locationService.districtName(entry, language) : this.selectedLocationArea;
    return language === 'ka' ? `${area} — ქუჩები` : `Streets in ${area}`;
  }

  locationText(english: string, georgian: string): string {
    return this.locationService.languageForQuery(this.searchLocation) === 'ka' ? georgian : english;
  }

  openLocationSearch(): void {
    this.toggleSearchMenu('location');
  }

  public get modalStreetSuggestions(): LocationSuggestion[] {
    if (this.inlineDrawnPolygon && this.drawnStreetSuggestions.length) {
      const query = this.streetSearch.trim().toLowerCase();
      const streets = this.drawnStreetSuggestions
        .filter((street) => !query || street.label.toLowerCase().includes(query) || street.value.toLowerCase().includes(query))
        .map((street) => ({ ...street, type: 'Street' as const, city: 'Tbilisi', district: this.drawnDetectedArea || this.selectedLocationArea }));
      return this.showAllStreets ? streets : streets.slice(0, 8);
    }
    if (!this.selectedLocationAreas.length) return [];
    const query = this.streetSearch.trim().toLowerCase();
    const streetGroups = this.selectedLocationAreas.map((selectedArea) =>
      this.locationEntries
        .filter((entry) => entry.district.toLowerCase() === selectedArea.toLowerCase() ||
          this.locationService.districtName(entry, 'en').toLowerCase() === selectedArea.toLowerCase())
        .flatMap((entry) => this.locationService.streetNames(entry, 'ka').map((street) => ({
          ...street,
          city: this.locationService.cityName(entry, 'en'),
          district: selectedArea,
        })))
        .filter((street) => !query ||
          street.label.toLowerCase().includes(query) ||
          street.value.toLowerCase().includes(query)),
    );
    const streets = Array.from(
      { length: Math.max(0, ...streetGroups.map((group) => group.length)) },
      (_, index) => streetGroups.map((group) => group[index]).filter((street) => !!street),
    )
      .flat()
      .filter((street, index, list) => list.findIndex((item) =>
        item.value === street.value && item.district === street.district) === index)
      .sort((first, second) => first.label.localeCompare(second.label, 'ka'));
    return (this.showAllStreets ? streets : streets.slice(0, 8))
      .map((street) => ({
        label: street.label === street.value
          ? street.value
          : `${street.label} — ${street.value}`,
        value: street.value,
        type: 'Street',
        city: street.city,
        district: street.district,
      }));
  }

  public get streetAreaTitle(): string {
    if (this.inlineDrawnPolygon && this.drawnDetectedArea) return `Streets in ${this.drawnDetectedArea}`;
    if (!this.selectedLocationAreas.length) return 'Streets in selected areas';
    return `Streets in ${this.selectedLocationAreas.join(' + ')}`;
  }

  public get apiTbilisiAreas(): string[] {
    return [...new Set(
      this.locationEntries
        .filter((entry) => entry.city === 'Tbilisi')
        .map((entry) => this.locationService.districtName(entry, 'en'))
        .filter((area) => !!area && area !== 'System.Collections.Hashtable'),
    )].sort((left, right) => left.localeCompare(right));
  }

  public get additionalTbilisiAreas(): string[] {
    const visibleAreas = new Set([
      ...this.featuredLocationAreas.map((area) => area.name),
      ...this.allLocationAreas,
    ].map((area) => area.toLowerCase()));
    return this.apiTbilisiAreas.filter((area) => !visibleAreas.has(area.toLowerCase()));
  }

  public get selectedAreaDescription(): string {
    return this.featuredLocationAreas.find((area) => area.name === this.selectedLocationArea)?.description
      || 'Explore homes, streets and neighborhoods in this area.';
  }

  public chooseAreaForModal(area: string): void {
    if (this.isAreaSelected(area)) {
      this.removeModalArea(area);
      return;
    }
    // The map is intentionally single-district: changing area must discard
    // every street and polygon belonging to the previous district.
    this.selectedLocationAreas = [area];
    this.selectedLocationArea = area;
    this.selectedModalStreetDetails = [];
    this.selectedModalStreets = [];
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
    this.selectedModalStreetDetails = this.selectedModalStreetDetails.filter((item) => item.district !== area);
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
      this.selectedModalStreetDetails = this.selectedModalStreetDetails.filter((item) => item.street !== street.label);
      this.selectedStreetId = this.selectedModalStreetDetails.at(-1)?.streetId ?? null;
    } else {
      if (!street.id) return;
      this.selectedModalStreets = [...this.selectedModalStreets, street.label];
      this.selectedModalStreetDetails = [...this.selectedModalStreetDetails, { streetId: street.id, street: street.label, district: street.district || '' }];
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

  public onDrawnStreets(streets: Array<{ id: number; label: string; value: string; district: string }>): void {
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
    const effectiveAreas = this.inlineDrawnPolygon && this.drawnDetectedArea
      ? [this.drawnDetectedArea]
      : this.selectedLocationAreas;
    this.searchLocation = effectiveAreas.length
      ? (this.selectedModalStreets.length
        ? `${effectiveAreas.join(', ')}: ${this.selectedModalStreets.join(', ')}`
        : effectiveAreas.join(', '))
      : 'Selected map area';
    this.selectedLocationValue = effectiveAreas.length
      ? (this.selectedModalStreets.length
        ? this.selectedModalStreets.join(',')
        : effectiveAreas.join(','))
      : '';
    this.selectedStreetId = this.selectedModalStreetDetails.at(-1)?.streetId ?? null;
    if (this.inlineDrawnPolygon) {
      sessionStorage.setItem('white-tower-drawn-area', JSON.stringify(this.inlineDrawnPolygon));
    } else {
      sessionStorage.removeItem('white-tower-drawn-area');
    }
    this.locationOpen = false;
  }

  focusLocationInput(input: HTMLInputElement): void {
    input.focus();
  }

  selectPopularArea(area: string): void {
    const entry = this.locationEntries.find((item) => item.district.toLowerCase() === area.toLowerCase());
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
      const street = this.locationService.streetNames(entry, 'en')
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
    const popularAreas = ['Vake', 'Saburtalo', 'Vera', 'Didi Digomi', 'Mtatsminda', 'Avlabari'];
    const index = popularAreas.indexOf(district);
    return index === -1 ? popularAreas.length : index;
  }

  get topApartments(): Apartment[] {
    return this.apartments
      .filter((apartment) => this.isDisplayableApartment(apartment))
      .slice(0, 4);
  }

  loadApartments(): void {
    this.loading = true;

    this.apartmentService.getApartments().subscribe({
      next: (data) => {
        this.apartments = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Apartment API error:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
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
    return toMediaUrl(agent.profilePictureUrl || agent.profilePicture || agent.avatarUrl) || '/agent1.jpg';
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

  getApartmentImage(apartment: Apartment): string {
    return toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) || '/property-placeholder.svg';
  }

  getApartmentTitle(apartment: Apartment): string {
    return apartment.title?.trim() || `Apartment #${apartment.id}`;
  }

  isExclusiveListing(apartment: Apartment): boolean {
    return /(?:^|[|\r\n])\s*Listing plan:\s*Velven Exclusive\b/i.test(
      apartment.description || '',
    );
  }

  getApartmentAddress(apartment: Apartment): string {
    return apartment.address?.trim() || 'Address not provided';
  }

  getApartmentLocationLabel(apartment: Apartment): string {
    const city = apartment.city?.trim() || 'Tbilisi';
    let district = apartment.district?.trim() || '';

    if (!district) {
      const locationText = [
        apartment.address,
        apartment.region,
        apartment.street,
      ].filter(Boolean).join(' ').toLowerCase();

      const matchedArea = this.locationEntries.find((entry) => {
        const names = [
          entry.district,
          this.locationService.districtName(entry, 'en'),
          this.locationService.districtName(entry, 'ka'),
        ].filter(Boolean).map((name) => name.toLowerCase());
        if (names.some((name) => locationText.includes(name))) return true;
        return this.locationService.streetNames(entry, 'en').some((street) =>
          locationText.includes(street.label.toLowerCase()) ||
          locationText.includes(street.value.toLowerCase()),
        );
      });
      district = matchedArea ? this.locationService.districtName(matchedArea, 'en') : '';
    }

    if (!district) return city;
    const matchedDistrict = this.locationEntries.find((entry) =>
      entry.district.toLowerCase() === district.toLowerCase() ||
      this.locationService.districtName(entry, 'ka').toLowerCase() === district.toLowerCase(),
    );
    const districtLabel = matchedDistrict
      ? this.locationService.districtName(matchedDistrict, 'en')
      : district;
    return `${city} ${districtLabel}`;
  }

  getApartmentDescription(apartment: Apartment): string {
    return apartment.description?.trim() || 'No description provided.';
  }

  searchHomes(): void {
    void this.router.navigate(['/ExploreProperty'], {
      queryParams: {
        mode: this.searchMode,
        area: this.inlineDrawnPolygon ? 'drawn' : null,
        location: this.inlineDrawnPolygon ? null : (this.selectedLocationValue || this.searchLocation || null),
        street_id: this.selectedStreetId || null,
        locationLanguage: this.locationService.languageForQuery(this.searchLocation),
        propertyType: this.searchPropertyType || null,
        budget: this.toUsd(this.appliedBudgetMax),
        budgetMin: this.toUsd(this.appliedBudgetMin),
        budgetCurrency: this.budgetCurrency,
        bedrooms: this.searchBedrooms || null,
        rooms: this.searchRooms || null,
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

  private normalizeBudget(value: number | null): number | null {
    const normalized = Number(value);
    return value == null || !Number.isFinite(normalized) || normalized < 0 ? null : normalized;
  }

  private toUsd(value: number | null): number | null {
    if (value == null) return null;
    return this.budgetCurrency === 'GEL' ? Math.round(value / 2.7) : value;
  }

  private normalizedSliderValue(value: number | null): number {
    return Math.min(100, Math.max(0, Number(value || 0) / 50));
  }

}
