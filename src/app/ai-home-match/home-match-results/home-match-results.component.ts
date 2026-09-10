import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { HomeMatchResult } from '../models/home-match-result';
import { toMediaUrl } from '../../utils/api-media';
import { HomeMatchProfile } from '../models/home-match-profile';
import { applyPriorityScoring } from '../services/priority-scoring';
import { ApartmentService } from '../../services/apartment.service';

interface LifestyleInsight {
  title: string;
  reason: string;
  icon: string;
}
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
  private readonly failedImageIndexes = new WeakMap<HTMLImageElement, number>();
  private readonly attemptedEnrichment = new WeakSet<HomeMatchResult>();

  constructor(private readonly apartmentService: ApartmentService, private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['matches']) {
      this.matches.forEach((result) => {
        Object.assign(result, applyPriorityScoring(result, this.profile));
        if (!this.imageCandidates(result).length) this.enrichApartment(result);
      });
    }
  }
  get sorted(): HomeMatchResult[] {
    return [...this.matches].sort(
      (a, b) => (b.rankingScore ?? b.matchScore) - (a.rankingScore ?? a.matchScore),
    );
  }
  image(result: HomeMatchResult): string {
    return this.imageCandidates(result)[0] || '/property-placeholder.svg';
  }

  private imageCandidates(result: HomeMatchResult): string[] {
    const images = [...(result.apartment.images || [])].sort(
      (a, b) => Number(b.isCover) - Number(a.isCover) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    return [
      ...new Set(
        [
          ...images.flatMap((item) => [item.url, item.storagePath]),
          ...(result.apartment.imageUrls || []),
          result.apartment.imageUrl,
        ]
          .map((source) => toMediaUrl(source))
          .filter(Boolean),
      ),
    ];
  }

  onImageError(event: Event, result: HomeMatchResult): void {
    const image = event.target as HTMLImageElement;
    if (image.classList.contains('placeholder-image')) return;
    const nextIndex = (this.failedImageIndexes.get(image) ?? 0) + 1;
    const nextImage = this.imageCandidates(result)[nextIndex];
    this.failedImageIndexes.set(image, nextIndex);
    if (nextImage) image.src = nextImage;
    else {
      this.enrichApartment(result, image);
    }
  }

  private enrichApartment(result: HomeMatchResult, image?: HTMLImageElement): void {
    const apartmentId = Number(result.apartment.id);
    if (!Number.isFinite(apartmentId) || this.enrichingApartmentIds.has(apartmentId) || this.attemptedEnrichment.has(result)) {
      if (image) this.showPlaceholder(image);
      return;
    }

    this.attemptedEnrichment.add(result);
    this.enrichingApartmentIds.add(apartmentId);
    this.apartmentService.getApartment(apartmentId).pipe(
      timeout(15000),
      finalize(() => {
        this.enrichingApartmentIds.delete(apartmentId);
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: (apartment) => {
        Object.assign(result.apartment, apartment);
        this.enrichingApartmentIds.delete(apartmentId);
        if (image) {
          const source = this.imageCandidates(result)[0];
          if (source) {
            this.failedImageIndexes.set(image, 0);
            image.classList.remove('placeholder-image');
            image.src = source;
          } else {
            this.showPlaceholder(image);
          }
        }
      },
      error: () => {
        this.enrichingApartmentIds.delete(apartmentId);
        if (image) this.showPlaceholder(image);
      },
    });
  }

  private showPlaceholder(image: HTMLImageElement): void {
    image.onerror = null;
    image.classList.add('placeholder-image');
    image.src = '/property-placeholder.svg';
  }

  rankHeadline(index: number): string {
    if (index === 0) return 'Based on your profile, this is the best match for you';
    return `Based on your profile, this is your ${this.ordinal(index + 1)} best match`;
  }

  rankLabel(index: number): string {
    return index === 0 ? 'Top recommendation' : `${this.ordinal(index + 1)} recommendation`;
  }

  private ordinal(value: number): string {
    const remainder = value % 100;
    if (remainder >= 11 && remainder <= 13) return `${value}th`;
    return `${value}${value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'}`;
  }

  mapAddress(result: HomeMatchResult): string {
    return (
      result.apartment.address || result.apartment.district || `${result.apartment.title}, Tbilisi`
    );
  }

  latitude(result: HomeMatchResult): number | undefined {
    const value = Number(result.apartment.propertyLatitude ?? result.apartment.latitude);
    return Number.isFinite(value) && value >= 40.8 && value <= 43.7 ? value : undefined;
  }

  longitude(result: HomeMatchResult): number | undefined {
    const value = Number(result.apartment.propertyLongitude ?? result.apartment.longitude);
    return Number.isFinite(value) && value >= 39.8 && value <= 46.8 ? value : undefined;
  }

  mapsUrl(result: HomeMatchResult): string {
    const latitude = this.latitude(result);
    const longitude = this.longitude(result);
    const query =
      latitude !== undefined && longitude !== undefined
        ? `${latitude},${longitude}`
        : this.mapAddress(result);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

  lifestyleInsights(result: HomeMatchResult): LifestyleInsight[] {
    const apartment = result.apartment;
    const insights: LifestyleInsight[] = [];
    const add = (title: string, reason: string, icon: string): void => {
      if (!insights.some((item) => item.title === title)) insights.push({ title, reason, icon });
    };
    const childAges = new Set(this.profile.childrenAgeGroups);
    const lifestyles = new Set(this.profile.lifestyles);
    const drives = this.profile.transportation.includes('Car');

    if (apartment.kindergartenDistanceMinutes != null && (childAges.has('Age0To3') || childAges.has('Age4To6'))) {
      add(
        `Kindergarten ${apartment.kindergartenDistanceMinutes} min away`,
        childAges.has('Age4To6')
          ? 'Because you have a 4–6-year-old child'
          : 'Because you have a young child',
        'fa-shapes',
      );
    }
    if (apartment.schoolDistanceMinutes != null && (childAges.has('Age7To12') || childAges.has('Age13To17'))) {
      add(
        `School ${apartment.schoolDistanceMinutes} min away`,
        'Because you have a school-age child',
        'fa-school',
      );
    }
    if (apartment.gymDistanceMinutes != null && lifestyles.has('Athlete')) {
      add(
        `Gym ${apartment.gymDistanceMinutes} min away`,
        'Because you have an active lifestyle',
        'fa-dumbbell',
      );
    }
    const parkingCondition = apartment.parkingCondition?.trim().toLowerCase();
    if (
      drives &&
      (apartment.hasParking === true ||
        (!!parkingCondition && !['no', 'none', 'not available', 'false'].includes(parkingCondition)))
    ) {
      add('Parking included', 'Because you travel by car', 'fa-square-parking');
    }
    if (
      lifestyles.has('HostsGuests') &&
      apartment.bedrooms != null &&
      apartment.bedrooms >= 2
    ) {
      add('Extra bedroom', 'Because you often host guests', 'fa-bed');
    }
    if (this.profile.hasPet && apartment.isPetFriendly) {
      add('Pet-friendly home', `Because you live with ${this.profile.petType === 'Cat' ? 'a cat' : 'a pet'}`, 'fa-paw');
    }
    if (apartment.metroDistanceMinutes != null && this.profile.transportation.includes('Metro')) {
      add(
        `Metro ${apartment.metroDistanceMinutes} min away`,
        'Because metro is part of your routine',
        'fa-train-subway',
      );
    }
    if (apartment.parkDistanceMinutes != null && (lifestyles.has('Athlete') || lifestyles.has('FamilyFocused'))) {
      add(
        `Park ${apartment.parkDistanceMinutes} min away`,
        lifestyles.has('Athlete') ? 'Because you enjoy an active lifestyle' : 'Because outdoor family time matters to you',
        'fa-tree',
      );
    }

    return insights.slice(0, 6);
  }
}
