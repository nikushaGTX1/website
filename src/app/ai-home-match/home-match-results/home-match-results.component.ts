import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { HomeMatchResult } from '../models/home-match-result';
import { MatchTradeOff } from '../models/home-match-result';
import { toMediaUrl } from '../../utils/api-media';
import { GoogleNearbyTimeService } from '../../maps/services/google-nearby-time.service';
import { HomeMatchProfile } from '../models/home-match-profile';
import { applyPriorityScoring } from '../services/priority-scoring';
@Component({
  selector: 'app-home-match-results',
  standalone: false,
  templateUrl: './home-match-results.component.html',
  styleUrl: './home-match-results.component.css',
})
export class HomeMatchResultsComponent implements OnChanges {
  @Input() matches: HomeMatchResult[] = [];
  @Input({ required: true }) profile!: HomeMatchProfile;
  @Output() edit = new EventEmitter<void>();
  readonly enrichingApartmentIds = new Set<number>();

  constructor(private nearbyTimeService: GoogleNearbyTimeService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['matches']) void this.enrichVisibleMatches();
  }
  get sorted(): HomeMatchResult[] {
    return [...this.matches].sort(
      (a, b) => (b.rankingScore ?? b.matchScore) - (a.rankingScore ?? a.matchScore),
    );
  }
  image(result: HomeMatchResult): string {
    return (
      toMediaUrl(result.apartment.imageUrls?.[0] || result.apartment.imageUrl) || '/banner.jpg'
    );
  }
  label(score: number): string {
    return score >= 95
      ? 'Perfect Match'
      : score >= 85
        ? 'Excellent Match'
        : score >= 70
          ? 'Good Match'
          : 'Possible Match';
  }

  hasNearbyTimes(result: HomeMatchResult): boolean {
    const apartment = result.apartment;
    return [
      apartment.schoolDistanceMinutes,
      apartment.kindergartenDistanceMinutes,
      apartment.groceryDistanceMinutes,
      apartment.gymDistanceMinutes,
      apartment.metroDistanceMinutes,
    ].some((value) => value !== undefined && value !== null);
  }

  visibleTradeOffs(result: HomeMatchResult): MatchTradeOff[] {
    return (result.tradeOffs || []).filter((tradeOff) => {
      const title = tradeOff.title.toLowerCase();
      if (title.includes('gym') && result.apartment.gymDistanceMinutes !== undefined) return false;
      if (title.includes('metro') && result.apartment.metroDistanceMinutes !== undefined)
        return false;
      if (title.includes('school') && result.apartment.schoolDistanceMinutes !== undefined)
        return false;
      if (
        title.includes('kindergarten') &&
        result.apartment.kindergartenDistanceMinutes !== undefined
      )
        return false;
      return true;
    });
  }

  private async enrichVisibleMatches(): Promise<void> {
    await Promise.all(
      this.sorted.slice(0, 6).map(async (result) => {
        const address = result.apartment.address || result.apartment.district;
        if (!address) return;
        this.enrichingApartmentIds.add(result.apartment.id);
        try {
          const times = await this.nearbyTimeService.getWalkingTimes(address);
          Object.assign(result.apartment, times);
          Object.assign(result, applyPriorityScoring(result, this.profile));
        } finally {
          this.enrichingApartmentIds.delete(result.apartment.id);
        }
      }),
    );
  }
}
