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
  selectedLocationValue = '';
  streetSearch = '';
  selectedModalStreets: string[] = [];
  inlineDrawnPolygon: GeoJsonPolygon | null = null;
  searchPropertyType = '';
  searchBudget = '';
  budgetOpen = false;
  bedroomOpen = false;
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
  readonly bedroomOptions = [
    { label: 'Studio', value: '0', icon: 'fa-solid fa-building' },
    { label: '1 Bed', value: '1', icon: 'fa-solid fa-bed' },
    { label: '2 Beds', value: '2', icon: 'fa-solid fa-bed' },
    { label: '3 Beds', value: '3', icon: 'fa-solid fa-bed' },
    { label: '4 Beds', value: '4', icon: 'fa-solid fa-bed' },
    { label: '4+ Beds', value: '4+', icon: 'fa-solid fa-layer-group' },
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
    return this.bedroomOptions.find((option) => option.value === this.searchBedrooms)?.label || 'Any';
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

  selectBedrooms(value: string): void {
    this.searchBedrooms = value;
    this.bedroomOpen = false;
  }

  clearBedrooms(): void {
    this.searchBedrooms = '';
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
    this.locationOpen = !this.locationOpen;
    if (this.locationOpen && !this.selectedLocationArea) this.chooseAreaForModal('Vake');
    this.budgetOpen = false;
    this.bedroomOpen = false;
    this.propertyTypeOpen = false;
  }

  get modalStreetSuggestions(): LocationSuggestion[] {
    if (!this.selectedLocationArea) return [];
    const query = this.streetSearch.trim().toLowerCase();
    const entry = this.locationEntries.find((item) =>
      item.district.toLowerCase() === this.selectedLocationArea.toLowerCase(),
    );
    if (!entry) return [];
    return this.locationService.streetNames(entry, 'en')
      .filter((street) => !query || street.label.toLowerCase().includes(query))
      .slice(0, 8)
      .map((street) => ({
        label: street.label,
        value: street.value,
        type: 'Street',
        city: this.locationService.cityName(entry, 'en'),
        district: this.locationService.districtName(entry, 'en'),
      }));
  }

  get selectedAreaDescription(): string {
    return this.featuredLocationAreas.find((area) => area.name === this.selectedLocationArea)?.description
      || 'Explore homes, streets and neighborhoods in this area.';
  }

  chooseAreaForModal(area: string): void {
    this.selectedLocationArea = area;
    this.inlineDrawnPolygon = null;
    this.selectedModalStreets = [];
    this.streetSearch = '';
  }

  isStreetSelected(street: string): boolean {
    return this.selectedModalStreets.includes(street);
  }

  toggleModalStreet(street: string): void {
    this.selectedModalStreets = this.isStreetSelected(street)
      ? this.selectedModalStreets.filter((item) => item !== street)
      : [...this.selectedModalStreets, street];
  }

  clearModalLocation(): void {
    this.selectedLocationArea = '';
    this.selectedModalStreets = [];
    this.streetSearch = '';
    this.inlineDrawnPolygon = null;
  }

  onInlinePolygon(polygon: GeoJsonPolygon | null): void {
    this.inlineDrawnPolygon = polygon;
  }

  cancelLocationPicker(): void {
    this.locationOpen = false;
  }

  applyModalLocation(): void {
    if (!this.selectedLocationArea) return;
    this.searchLocation = this.selectedModalStreets.length
      ? `${this.selectedLocationArea}: ${this.selectedModalStreets.join(', ')}`
      : this.selectedLocationArea;
    this.selectedLocationValue = this.selectedModalStreets[0] || this.selectedLocationArea;
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
    this.selectedLocationArea = suggestion.type === 'Area' ? this.selectedLocationValue : '';
    this.showLocationResults = false;
    this.locationOpen = false;
  }

  onLocationInput(): void {
    this.selectedLocationArea = '';
    this.selectedLocationValue = '';
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
        console.log('Apartments loaded:', data);
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

  getApartmentAddress(apartment: Apartment): string {
    return apartment.address?.trim() || 'Address not provided';
  }

  getApartmentDescription(apartment: Apartment): string {
    return apartment.description?.trim() || 'No description provided.';
  }

  searchHomes(): void {
    void this.router.navigate(['/ExploreProperty'], {
      queryParams: {
        mode: this.searchMode,
        location: this.selectedLocationValue || this.searchLocation || null,
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
    void this.router.navigate(['/ExploreProperty'], {
      queryParams: {
        mode: polygon.searchMode || this.searchMode,
        area: 'drawn',
        location: polygon.streetName || null,
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
