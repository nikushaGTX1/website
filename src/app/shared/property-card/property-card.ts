import { Component, Input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Apartment } from '../../models/apartment';
import { CurrencyPrice } from '../../currency-price/currency-price';
import { ListingTitlePipe } from '../listing-title.pipe';
import { PhotoUrlPipe } from '../photo-url.pipe';
import { FavoriteService } from '../../services/favorite.service';
import { toMediaUrl } from '../../utils/api-media';
import { isSaleListing } from '../../utils/listing-deal';
import { cardNearbyPlaces, NearbyPlace } from '../../utils/nearby-places';

/** The home page "Featured Properties" card, reusable (property page suggestions). */
@Component({
  selector: 'app-property-card',
  templateUrl: './property-card.html',
  styleUrl: './property-card.css',
  imports: [NgIf, NgFor, RouterLink, CurrencyPrice, ListingTitlePipe, PhotoUrlPipe],
})
export class PropertyCard {
  @Input({ required: true }) apartment!: Apartment;

  constructor(readonly favorites: FavoriteService) {}

  get image(): string {
    return toMediaUrl(this.apartment.imageUrls?.[0] || this.apartment.imageUrl) || '/property-placeholder.svg';
  }

  get isSale(): boolean {
    return isSaleListing(this.apartment);
  }

  get verified(): boolean {
    return /(?:^|[|\r\n])\s*Verified listing:\s*Yes\b/i.test(this.apartment.description || '');
  }

  get location(): string {
    return [this.apartment.city?.trim() || 'Tbilisi', this.apartment.district?.trim()].filter(Boolean).join(' ');
  }

  get nearby(): NearbyPlace[] {
    return cardNearbyPlaces(this.apartment);
  }

  toggleFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favorites.toggleFavorite(this.apartment.id).subscribe({ error: () => undefined });
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!image.src.endsWith('/property-placeholder.svg')) image.src = '/property-placeholder.svg';
  }
}
