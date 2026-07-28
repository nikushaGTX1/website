import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { Apartment } from '../models/apartment';
import { ApartmentService } from '../services/apartment.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FavoriteService } from '../services/favorite.service';
import { AuthService } from '../services/auth.service';
import { ApiLocation, LocationSuggestion } from '../models/location';
import { LocationService } from '../services/location.service';
import { TranslationService } from '../services/translation.service';

@Component({
  selector: 'app-explore-property',
  standalone: false,
  templateUrl: './explore-property.html',
  styleUrl: './explore-property.css',
})
export class ExploreProperty implements OnInit {
  apartments: Apartment[] = [];
  filteredApartments: Apartment[] = [];

  loading = false;
  errorMessage = '';

  bedroomOptions = ['Studio', '1 Bedroom', '2 Bedrooms', '3 Bedrooms', '4+ Bedrooms'];
  bathroomOptions = ['1+ Bathrooms', '2+ Bathrooms', '3+ Bathrooms'];
  propertyTypeOptions = ['Apartament', 'House', 'Commercial Place', 'Country house'];
  amenityOptions = ['Parking', 'Balcony', 'Elevator', 'Pool', 'Furnished'];

  searchQuery = '';
  selectedType = 'For Rent'; 
  priceRange = '';
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
  readonly headerBedroomOptions = [
    { label: 'Studio', value: '0', icon: 'fa-solid fa-building' },
    { label: '1 Bed', value: '1', icon: 'fa-solid fa-bed' },
    { label: '2 Beds', value: '2', icon: 'fa-solid fa-bed' },
    { label: '3 Beds', value: '3', icon: 'fa-solid fa-bed' },
    { label: '4 Beds', value: '4', icon: 'fa-solid fa-bed' },
    { label: '4+ Beds', value: '4+', icon: 'fa-solid fa-layer-group' },
  ];
  homeType = '';
  location = '';
  locationOpen = false;
  locationLoading = false;
  locationError = false;
  locationEntries: ApiLocation[] = [];
  selectedLocationArea = '';
  selectedLocationValue = '';
  headerBedrooms = '';
  featureFilter = '';

  selectedPriceMax = 3000;
  selectedBedrooms: string[] = [];
  selectedBathrooms: string[] = [];
  selectedPropertyTypes: string[] = [];
  selectedAmenities: string[] = [];

  selectedApartment: Apartment | null = null;
  propertiesPlaceholder = new Array(6);
  currentSort = 'newest';
  currentPage = 1;
  pageSize = 12;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredApartments.length / this.pageSize));
  }

  get budgetSummary(): string {
    if (this.appliedBudgetMin == null && this.appliedBudgetMax == null) return 'Any budget';
    const code = this.budgetCurrency;
    if (this.appliedBudgetMin != null && this.appliedBudgetMax != null) {
      return `${this.appliedBudgetMin.toLocaleString()} – ${this.appliedBudgetMax.toLocaleString()} ${code}`;
    }
    if (this.appliedBudgetMin != null) return `${this.appliedBudgetMin.toLocaleString()}+ ${code}`;
    return `Up to ${this.appliedBudgetMax!.toLocaleString()} ${code}`;
  }

  get headerBedroomSummary(): string {
    return this.headerBedroomOptions.find((option) => option.value === this.headerBedrooms)?.label || 'Any';
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

  setBudgetCurrency(currency: 'GEL' | 'USD'): void {
    this.budgetCurrency = currency;
  }

  applyBudget(): void {
    this.appliedBudgetMin = this.normalizedBudgetValue(this.budgetMin);
    this.appliedBudgetMax = this.normalizedBudgetValue(this.budgetMax);
    this.budgetOpen = false;
    this.onSearch();
  }

  resetBudget(): void {
    this.budgetMin = 0;
    this.budgetMax = 5000;
    this.appliedBudgetMin = null;
    this.appliedBudgetMax = null;
    this.selectedBudgetRange = '';
    this.budgetOpen = false;
    this.onSearch();
  }

  selectHeaderBedrooms(value: string): void {
    this.headerBedrooms = value;
    this.bedroomOpen = false;
    this.onSearch();
  }

  clearHeaderBedrooms(): void {
    this.headerBedrooms = '';
    this.bedroomOpen = false;
    this.onSearch();
  }

  selectHeaderPropertyType(value: string): void {
    this.homeType = value;
    this.propertyTypeOpen = false;
    this.onSearch();
  }

  get areaSuggestions(): LocationSuggestion[] {
    const query = this.location.trim().toLowerCase();
    const language = this.translation.language$.value;
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
    const query = this.location.trim().toLowerCase();
    const language = this.translation.language$.value;
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
    return `Streets in ${entry ? this.locationService.districtName(entry, this.translation.language$.value) : this.selectedLocationArea}`;
  }

  openLocationSearch(): void {
    this.locationOpen = true;
    this.budgetOpen = false;
    this.bedroomOpen = false;
    this.propertyTypeOpen = false;
  }

  selectLocation(suggestion: LocationSuggestion): void {
    this.location = suggestion.label;
    this.selectedLocationValue = suggestion.value || suggestion.label;
    this.selectedLocationArea = suggestion.type === 'Area' ? this.selectedLocationValue : '';
    this.locationOpen = suggestion.type === 'Area';
    if (suggestion.type !== 'Area') this.onSearch();
  }

  onLocationInput(): void {
    this.selectedLocationArea = '';
    this.selectedLocationValue = '';
    this.openLocationSearch();
  }

  private loadLocations(): void {
    this.locationLoading = true;
    this.locationService.getLocations().subscribe({
      next: (locations) => {
        this.locationEntries = locations;
        this.localizeSelectedLocation();
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

  private localizeSelectedLocation(): void {
    if (!this.selectedLocationValue || this.translation.language$.value !== 'ka') return;
    const area = this.locationEntries.find((entry) => entry.district === this.selectedLocationValue);
    if (area) {
      this.location = this.locationService.districtName(area, 'ka');
      return;
    }

    for (const entry of this.locationEntries) {
      const street = this.locationService
        .streetNames(entry, 'ka')
        .find((item) => item.value === this.selectedLocationValue);
      if (street) {
        this.location = street.label;
        return;
      }
    }
  }

  get paginatedApartments(): Apartment[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredApartments.slice(start, start + this.pageSize);
  }

  get visiblePages(): number[] {
    if (this.totalPages <= 4) {
      return Array.from({ length: this.totalPages }, (_, index) => index + 1);
    }
    if (this.currentPage <= 3) return [1, 2, 3];
    if (this.currentPage >= this.totalPages - 2) {
      return [this.totalPages - 2, this.totalPages - 1, this.totalPages];
    }
    return [this.currentPage - 1, this.currentPage, this.currentPage + 1];
  }

  constructor(
    private apartmentService: ApartmentService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private locationService: LocationService,
    private translation: TranslationService,
    readonly favoriteService: FavoriteService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.selectedType = params.get('mode') === 'buy' ? 'For Sale' : 'For Rent';
    this.location = params.get('location') || '';
    this.selectedLocationValue = this.location;
    this.homeType = params.get('propertyType') || '';
    this.headerBedrooms = params.get('bedrooms') || '';
    this.featureFilter = params.get('feature') || '';
    const budget = Number(params.get('budget'));
    if (budget > 0) this.selectedPriceMax = budget;
    this.loadApartments();
    this.loadLocations();
    this.favoriteService.loadFavorites().subscribe({
      next: () => this.cdr.detectChanges(),
      error: () => undefined,
    });
  }

  toggleFavorite(event: Event, apartment: Apartment): void {
    event.stopPropagation();
    if (!this.authService.isLoggedIn) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/ExploreProperty' } });
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

  loadApartments(): void {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.apartmentService.getApartments().subscribe({
      next: (apartments) => {
        this.apartments = apartments;
        this.onSearch(); // Perform initial search on page load
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('API Error:', err);
        this.apartments = [];
        this.filteredApartments = [];
        this.loading = false;
        this.errorMessage = 'Could not load apartments right now.';
        this.cdr.detectChanges();
      },
    });
  }

  
  onSearch(): void {
    const query = this.searchQuery.trim().toLowerCase();
    const loc = (this.selectedLocationValue || this.location).trim().toLowerCase();
    const home = this.homeType.trim().toLowerCase();

    this.filteredApartments = this.apartments.filter((apartment) => {
      const haystack = [
        apartment.title,
        apartment.description,
        apartment.address,
        apartment.city,
        apartment.district,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesQuery = !query || haystack.includes(query);
      const matchesHome = this.matchesHeaderPropertyType(apartment, home);
      const matchesLocation = !loc || haystack.includes(loc);
      const matchesHeaderBedrooms = this.matchesHeaderBedroom(apartment);

      const matchesHeaderPrice = this.matchesPriceRange(apartment.price);
      const matchesCustomBudget = this.matchesCustomBudget(apartment.price);
      const matchesSliderPrice = apartment.price <= this.selectedPriceMax;
      const matchesBedrooms = this.matchesBedroomFilter(apartment);
      const matchesBathrooms = this.matchesBathroomFilter(apartment);
      const matchesPropertyType = this.matchesPropertyTypeFilter(apartment);
      const matchesAmenities = this.matchesAmenitiesFilter(apartment);
      const matchesFeature = this.matchesQuickFeature(apartment);

      return (
        matchesQuery &&
        matchesHome &&
        matchesLocation &&
        matchesHeaderBedrooms &&
        matchesHeaderPrice &&
        matchesCustomBudget &&
        matchesSliderPrice &&
        matchesBedrooms &&
        matchesBathrooms &&
        matchesPropertyType &&
        matchesAmenities
        && matchesFeature
      );
    });

    this.applySorting();
    this.currentPage = 1;

    if (this.filteredApartments.length === 0) {
      this.selectedApartment = null;
    } else {
      this.selectApartment(this.filteredApartments[0], false);
    }

    this.cdr.detectChanges();
  }

  toggleFilterItem(list: string[], item: string): void {
    const index = list.indexOf(item);
    if (index > -1) {
      list.splice(index, 1);
    } else {
      list.push(item);
    }
  }

  isFilterActive(list: string[], item: string): boolean {
    return list.includes(item);
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedType = 'For Rent';
    this.priceRange = '';
    this.budgetMin = 0;
    this.budgetMax = 5000;
    this.appliedBudgetMin = null;
    this.appliedBudgetMax = null;
    this.homeType = '';
    this.location = '';
    this.selectedLocationValue = '';
    this.selectedLocationArea = '';
    this.headerBedrooms = '';

    this.selectedPriceMax = 3000;
    this.selectedBedrooms = [];
    this.selectedBathrooms = [];
    this.selectedPropertyTypes = [];
    this.selectedAmenities = [];

    this.onSearch();
  }

  onSortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.currentSort = select.value;
    this.applySorting();
    this.currentPage = 1;
  }


  goToPage(page: number): void {
    this.currentPage = Math.min(Math.max(page, 1), this.totalPages);
    document.querySelector('.results-header')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  onPageSizeChange(event: Event): void {
    this.pageSize = Number((event.target as HTMLSelectElement).value);
    this.currentPage = 1;
  }

  focusFilters(): void {
    document.querySelector('.sidebar-filters')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  private applySorting(): void {
    if (this.currentSort === 'price-asc') {
      this.filteredApartments.sort((a, b) => a.price - b.price);
    } else if (this.currentSort === 'price-desc') {
      this.filteredApartments.sort((a, b) => b.price - a.price);
    }
  }

  selectApartment(apartment: Apartment, updateView = true): void {
    this.selectedApartment = apartment;
    if (updateView) {
      this.cdr.detectChanges();
    }
  }

  getApartmentLocation(apartment: Apartment): string {
    const address = apartment.address?.trim();
    return address ? address.split(',')[0].trim() : 'Tbilisi, Georgia';
  }

  getApartmentStreet(apartment: Apartment): string {
    return apartment.address || 'Address not provided';
  }

  private matchesPriceRange(price: number): boolean {
    switch (this.priceRange) {
      case '0-1000': return price <= 1000;
      case '600-2000': return price >= 600 && price <= 2000;
      case '1000-2000': return price >= 1000 && price <= 2000;
      case '2000+': return price >= 2000;
      default: return true;
    }
  }

  private matchesBedroomFilter(apartment: Apartment): boolean {
    if (this.selectedBedrooms.length === 0) return true;
    const text = `${apartment.title} ${apartment.description}`.toLowerCase();
    return this.selectedBedrooms.some((bed) => text.includes(bed.toLowerCase()));
  }

  private matchesHeaderBedroom(apartment: Apartment): boolean {
    if (!this.headerBedrooms) return true;
    const bedrooms = Number(apartment.bedrooms || 0);
    if (this.headerBedrooms === '4+') return bedrooms >= 4;
    return bedrooms === Number(this.headerBedrooms);
  }

  private matchesBathroomFilter(apartment: Apartment): boolean {
    if (this.selectedBathrooms.length === 0) return true;
    const text = `${apartment.title} ${apartment.description}`.toLowerCase();
    return this.selectedBathrooms.some((bath) => text.includes(bath.toLowerCase()));
  }

  private matchesPropertyTypeFilter(apartment: Apartment): boolean {
    if (this.selectedPropertyTypes.length === 0) return true;
    return this.selectedPropertyTypes.some((type) =>
      this.matchesHeaderPropertyType(apartment, type.toLowerCase()),
    );
  }

  private matchesHeaderPropertyType(apartment: Apartment, selectedType: string): boolean {
    if (!selectedType) return true;
    const text = `${apartment.apartmentStyle || ''} ${apartment.title || ''} ${apartment.description || ''}`.toLowerCase();
    if (selectedType === 'house' && text.includes('country house')) return false;
    const aliases: Record<string, string[]> = {
      apartment: ['apartment', 'flat'],
      apartament: ['apartment', 'apartament', 'flat'],
      'commercial place': ['commercial place', 'commercial', 'office', 'shop'],
      house: ['house', 'private house'],
      'country house': ['country house', 'cottage', 'villa'],
    };
    return (aliases[selectedType] || [selectedType]).some((value) => text.includes(value));
  }

  private matchesAmenitiesFilter(apartment: Apartment): boolean {
    if (this.selectedAmenities.length === 0) return true;
    const text = `${apartment.title} ${apartment.description}`.toLowerCase();
    return this.selectedAmenities.every((amenity) => text.includes(amenity.toLowerCase()));
  }

  private normalizedBudgetValue(value: number | null): number | null {
    if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
    return Number(value);
  }

  private normalizedSliderValue(value: number | null): number {
    return Math.min(100, Math.max(0, Number(value || 0) / 50));
  }

  private matchesCustomBudget(priceInUsd: number): boolean {
    const exchangeRate = 2.7;
    const comparablePrice = this.budgetCurrency === 'GEL' ? priceInUsd * exchangeRate : priceInUsd;
    return (
      (this.appliedBudgetMin == null || comparablePrice >= this.appliedBudgetMin) &&
      (this.appliedBudgetMax == null || comparablePrice <= this.appliedBudgetMax)
    );
  }

  private matchesQuickFeature(apartment: Apartment): boolean {
    switch (this.featureFilter) {
      case 'parking': return !!apartment.hasParking;
      case 'pets': return !!apartment.isPetFriendly;
      case 'metro': return Number(apartment.metroDistanceMinutes || 999) <= 15;
      case 'family': return Number(apartment.bedrooms || 0) >= 2;
      default: return true;
    }
  }
}
