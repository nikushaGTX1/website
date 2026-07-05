import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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

  searchQuery = '';
  selectedType = '';
  priceRange = '';
  homeType = '';
  location = '';

  selectedApartment: Apartment | null = null;
  mapUrl: SafeResourceUrl;

  propertiesPlaceholder = new Array(4);

  constructor(
    private apartmentService: ApartmentService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {
    this.mapUrl = this.createMapUrl('Tbilisi, Georgia');
  }

  ngOnInit(): void {
    this.loadApartments();
  }

  loadApartments(): void {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.apartmentService.getApartments().subscribe({
      next: (apartments) => {
        console.log('Explore apartments loaded:', apartments);

        this.apartments = apartments;
        this.filteredApartments = [...apartments];

        if (apartments.length > 0) {
          this.selectApartment(apartments[0], false);
        } else {
          this.selectedApartment = null;
          this.mapUrl = this.createMapUrl('Tbilisi, Georgia');
        }

        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Explore apartments API error:', err);

        this.apartments = [];
        this.filteredApartments = [];
        this.selectedApartment = null;

        this.loading = false;
        this.errorMessage = 'Could not load apartments right now.';

        this.cdr.detectChanges();
      },
    });
  }

  onSearch(): void {
    const query = this.searchQuery.trim().toLowerCase();
    const location = this.location.trim().toLowerCase();
    const selectedType = this.selectedType.trim().toLowerCase();
    const homeType = this.homeType.trim().toLowerCase();

    this.filteredApartments = this.apartments.filter((apartment) => {
      const haystack = [
        apartment.title,
        apartment.description,
        apartment.address,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (
        (!query || haystack.includes(query)) &&
        (!selectedType || haystack.includes(selectedType)) &&
        (!homeType || haystack.includes(homeType)) &&
        (!location || haystack.includes(location)) &&
        this.matchesPrice(apartment.price)
      );
    });

    if (this.filteredApartments.length === 0) {
      this.selectedApartment = null;
    } else if (
      !this.selectedApartment ||
      !this.filteredApartments.some((apartment) => apartment.id === this.selectedApartment?.id)
    ) {
      this.selectApartment(this.filteredApartments[0], false);
    }

    this.cdr.detectChanges();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedType = '';
    this.priceRange = '';
    this.homeType = '';
    this.location = '';

    this.filteredApartments = [...this.apartments];

    if (this.apartments.length > 0) {
      this.selectApartment(this.apartments[0], false);
    } else {
      this.selectedApartment = null;
      this.mapUrl = this.createMapUrl('Tbilisi, Georgia');
    }

    this.cdr.detectChanges();
  }

  selectApartment(apartment: Apartment, updateView = true): void {
    this.selectedApartment = apartment;
    this.mapUrl = this.createMapUrl(this.getApartmentMapQuery(apartment));

    if (updateView) {
      this.cdr.detectChanges();
    }
  }

  getApartmentMapQuery(apartment: Apartment): string {
    return apartment.address || apartment.title || 'Tbilisi, Georgia';
  }

  getApartmentLocation(apartment: Apartment): string {
    const address = apartment.address?.trim();
    if (!address) return 'Tbilisi, Georgia';

    return address.split(',')[0].trim() || address;
  }

  getApartmentStreet(apartment: Apartment): string {
    return apartment.address || 'Address not provided';
  }

  getApartmentRating(apartment: Apartment): string {
    const rating = 4.6 + (apartment.id % 5) * 0.08;
    return Math.min(rating, 5).toFixed(2);
  }

  getApartmentDistance(apartment: Apartment): string {
    return `${(apartment.id % 6) + 1}.${apartment.id % 10} kilometers away`;
  }

  private matchesPrice(price: number): boolean {
    switch (this.priceRange) {
      case '0-1000':
        return price >= 0 && price <= 1000;
      case '1000-2000':
        return price > 1000 && price <= 2000;
      case '2000+':
        return price > 2000;
      default:
        return true;
    }
  }

  private createMapUrl(query: string): SafeResourceUrl {
    const encodedQuery = encodeURIComponent(query);

    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://maps.google.com/maps?q=${encodedQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`
    );
  }
}