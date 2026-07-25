import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Apartment } from '../models/apartment';
import { ApartmentService } from '../services/apartment.service';

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
  propertyTypeOptions = ['Apartment', 'House', 'Townhouse', 'Penthouse'];
  amenityOptions = ['Parking', 'Balcony', 'Elevator', 'Pool', 'Furnished'];

  searchQuery = '';
  selectedType = 'For Rent'; 
  priceRange = '';
  homeType = '';
  location = '';
  headerBedrooms = '';

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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadApartments();
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
    const loc = this.location.trim().toLowerCase();
    const home = this.homeType.trim().toLowerCase();

    this.filteredApartments = this.apartments.filter((apartment) => {
      const haystack = [
        apartment.title,
        apartment.description,
        apartment.address,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesQuery = !query || haystack.includes(query);
      const matchesHome = !home || haystack.includes(home);
      const matchesLocation = !loc || haystack.includes(loc);
      const matchesHeaderBedrooms =
        !this.headerBedrooms ||
        Number(apartment.bedrooms || 0) >= Number(this.headerBedrooms);

      const matchesHeaderPrice = this.matchesPriceRange(apartment.price);
      const matchesSliderPrice = apartment.price <= this.selectedPriceMax;
      const matchesBedrooms = this.matchesBedroomFilter(apartment);
      const matchesBathrooms = this.matchesBathroomFilter(apartment);
      const matchesPropertyType = this.matchesPropertyTypeFilter(apartment);
      const matchesAmenities = this.matchesAmenitiesFilter(apartment);

      return (
        matchesQuery &&
        matchesHome &&
        matchesLocation &&
        matchesHeaderBedrooms &&
        matchesHeaderPrice &&
        matchesSliderPrice &&
        matchesBedrooms &&
        matchesBathrooms &&
        matchesPropertyType &&
        matchesAmenities
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
    this.homeType = '';
    this.location = '';
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

  private matchesBathroomFilter(apartment: Apartment): boolean {
    if (this.selectedBathrooms.length === 0) return true;
    const text = `${apartment.title} ${apartment.description}`.toLowerCase();
    return this.selectedBathrooms.some((bath) => text.includes(bath.toLowerCase()));
  }

  private matchesPropertyTypeFilter(apartment: Apartment): boolean {
    if (this.selectedPropertyTypes.length === 0) return true;
    const text = `${apartment.title} ${apartment.description}`.toLowerCase();
    return this.selectedPropertyTypes.some((type) => text.includes(type.toLowerCase()));
  }

  private matchesAmenitiesFilter(apartment: Apartment): boolean {
    if (this.selectedAmenities.length === 0) return true;
    const text = `${apartment.title} ${apartment.description}`.toLowerCase();
    return this.selectedAmenities.every((amenity) => text.includes(amenity.toLowerCase()));
  }
}
