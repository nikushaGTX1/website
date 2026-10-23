import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Apartment } from '../../models/apartment';
import { CurrencyPrice } from '../../currency-price/currency-price';
import { ListingTitlePipe } from '../../shared/listing-title.pipe';
import { FavoriteService } from '../../services/favorite.service';
import { toMediaUrl } from '../../utils/api-media';
import { isSaleListing } from '../../utils/listing-deal';

/** A listing card in Velven Discover, styled like the Saved Listings cards. */
@Component({
  selector: 'app-discover-card',
  templateUrl: './discover-card.html',
  styleUrl: './discover-card.css',
  imports: [NgIf, RouterLink, CurrencyPrice, ListingTitlePipe],
})
export class DiscoverCard {
  @Input({ required: true }) apartment!: Apartment;
  /** Shows the "New match" badge (published after the search was saved, not opened yet). */
  @Input() isNew = false;
  /** Nothing fails, but something still needs confirming with the agent (e.g. pets). */
  @Input() needsCheck = false;
  /** Opened from an alert: briefly outlined so it is easy to find. */
  @Input() highlighted = false;
  /** Name of the saved search it matches, when the list shows several searches. */
  @Input() searchName = '';
  @Output() opened = new EventEmitter<Apartment>();

  constructor(readonly favorites: FavoriteService) {}

  get image(): string {
    return toMediaUrl(this.apartment.imageUrls?.[0] || this.apartment.imageUrl) || '/property-placeholder.svg';
  }

  get isSale(): boolean {
    return isSaleListing(this.apartment);
  }

  get location(): string {
    return [this.apartment.street, this.apartment.district].filter(Boolean).join(', ') || this.apartment.city || 'Tbilisi';
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
