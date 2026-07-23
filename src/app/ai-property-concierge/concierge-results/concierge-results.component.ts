import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ApartmentMatchResult } from '../models/apartment-match-result';
import { toMediaUrl } from '../../utils/api-media';

@Component({
  selector: 'app-concierge-results',
  standalone: false,
  templateUrl: './concierge-results.component.html',
  styleUrl: './concierge-results.component.css',
})
export class ConciergeResultsComponent {
  @Input() matches: ApartmentMatchResult[] = [];
  @Output() adjust = new EventEmitter<void>();

  get sortedMatches(): ApartmentMatchResult[] {
    return [...this.matches].sort((a, b) => b.matchScore - a.matchScore);
  }
  image(match: ApartmentMatchResult): string {
    return toMediaUrl(match.apartment.imageUrls?.[0] || match.apartment.imageUrl) || '/banner.jpg';
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
