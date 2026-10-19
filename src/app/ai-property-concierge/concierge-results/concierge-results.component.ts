import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ApartmentMatchResult } from '../models/apartment-match-result';
import { toMediaUrl } from '../../utils/api-media';
import { NgIf, NgFor, SlicePipe } from '@angular/common';
import { CurrencyPrice } from '../../currency-price/currency-price';
import { RouterLink } from '@angular/router';
import { ListingTitlePipe } from '../../shared/listing-title.pipe';

@Component({
  selector: 'app-concierge-results',
  templateUrl: './concierge-results.component.html',
  styleUrl: './concierge-results.component.css',
  imports: [NgIf, NgFor, CurrencyPrice, RouterLink, SlicePipe, ListingTitlePipe],
})
export class ConciergeResultsComponent {
  @Input() matches: ApartmentMatchResult[] = [];
  @Output() adjust = new EventEmitter<void>();

  get sortedMatches(): ApartmentMatchResult[] {
    return [...this.matches].sort((a, b) => b.matchScore - a.matchScore);
  }
  image(match: ApartmentMatchResult): string {
    return (
      toMediaUrl(match.apartment.imageUrls?.[0] || match.apartment.imageUrl) ||
      '/property-placeholder.svg'
    );
  }
  location(match: ApartmentMatchResult): string {
    return match.apartment.district || match.apartment.address || 'Tbilisi';
  }
  label(score: number): string {
    if (score >= 95) return 'Perfect Match';
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Good Match';
    return 'Possible Match';
  }
}
