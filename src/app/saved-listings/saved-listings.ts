import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { combineLatest } from 'rxjs';
import { Apartment } from '../models/apartment';
import { ApartmentService } from '../services/apartment.service';
import { FavoriteService } from '../services/favorite.service';
import { toMediaUrl } from '../utils/api-media';

@Component({
  selector: 'app-saved-listings',
  standalone: false,
  templateUrl: './saved-listings.html',
  styleUrl: './saved-listings.css',
})
export class SavedListings implements OnInit {
  apartments: Apartment[] = [];
  loading = true;
  errorMessage = '';
  sort = 'recent';
  view: 'grid' | 'list' = 'grid';

  constructor(
    private apartmentService: ApartmentService,
    readonly favoriteService: FavoriteService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.apartmentService.getApartments(),
      this.favoriteService.loadFavorites(true),
    ]).subscribe({
      next: ([apartments, favoriteIds]) => {
        this.apartments = apartments.filter((apartment) => favoriteIds.has(apartment.id));
        this.applySort();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Saved listings API error:', error);
        this.errorMessage = 'Could not load your saved properties right now.';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  removeFavorite(event: Event, apartment: Apartment): void {
    event.preventDefault();
    event.stopPropagation();
    const previousApartments = this.apartments;
    this.apartments = this.apartments.filter((item) => item.id !== apartment.id);
    this.cdr.detectChanges();

    this.favoriteService.toggleFavorite(apartment.id).subscribe({
      error: (error) => {
        this.apartments = previousApartments;
        this.cdr.detectChanges();
        console.error('Favorite API error:', error);
      },
    });
  }

  onSortChange(): void {
    this.applySort();
  }

  getImage(apartment: Apartment): string {
    return toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) || '/property-placeholder.svg';
  }

  getLocation(apartment: Apartment): string {
    return [apartment.city || 'Tbilisi', apartment.district].filter(Boolean).join(', ');
  }

  getBadge(index: number): { label: string; icon: string } {
    const badges = [
      { label: 'Premium', icon: 'fa-solid fa-crown' },
      { label: 'Hot', icon: 'fa-solid fa-fire' },
      { label: 'Featured', icon: 'fa-solid fa-star' },
      { label: 'New', icon: 'fa-solid fa-star' },
    ];
    return badges[index % badges.length];
  }

  private applySort(): void {
    this.apartments = [...this.apartments].sort((a, b) => {
      if (this.sort === 'price-low') return a.price - b.price;
      if (this.sort === 'price-high') return b.price - a.price;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }
}
