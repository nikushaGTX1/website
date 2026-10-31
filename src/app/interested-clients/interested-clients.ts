import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InterestedClient, ListingInterest, ListingInterestService } from '../services/listing-interest.service';
import { AuthService } from '../services/auth.service';
import { ListingTitlePipe } from '../shared/listing-title.pipe';
import { CurrencyPrice } from '../currency-price/currency-price';
import { answerLabel } from '../ai-home-match/services/answer-labels';
import { toMediaUrl } from '../utils/api-media';
import { isSaleListing } from '../utils/listing-deal';

/**
 * Owners and agents: for each published listing, the clients whose saved Velven Match search it
 * meets. Clients stay anonymous; contact goes through Velven.
 */
@Component({
  selector: 'app-interested-clients',
  imports: [CommonModule, RouterLink, ListingTitlePipe, CurrencyPrice],
  templateUrl: './interested-clients.html',
  styleUrl: './interested-clients.css',
})
export class InterestedClients implements OnInit {
  readonly label = answerLabel;
  listings: ListingInterest[] = [];
  loading = true;
  error = false;
  focusId: number | null = null;

  constructor(
    private interests: ListingInterestService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.focusId = Number(this.route.snapshot.queryParamMap.get('apartment')) || null;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = false;
    this.interests.getInterests().subscribe({
      next: (listings) => {
        // The listing from the notification first, then listings with the most clients.
        this.listings = [...listings].sort((a, b) =>
          Number(b.apartmentId === this.focusId) - Number(a.apartmentId === this.focusId) ||
          b.clients.length - a.clients.length);
        this.loading = false;
        this.cdr.markForCheck();
        // Opening the page counts as seeing the alerts.
        if (listings.some((listing) => listing.clients.some((client) => client.isNew))) {
          this.interests.markAllRead().subscribe({ error: () => undefined });
        }
        if (this.focusId) {
          setTimeout(() => document.getElementById('listing-' + this.focusId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
      },
      error: () => {
        this.loading = false;
        this.error = true;
        this.cdr.markForCheck();
      },
    });
  }

  get isStaff(): boolean {
    return this.auth.isStaff;
  }

  get totalClients(): number {
    return this.listings.reduce((sum, listing) => sum + listing.clients.length, 0);
  }

  get listingsWithClients(): number {
    return this.listings.filter((listing) => listing.clients.length).length;
  }

  image(listing: ListingInterest): string {
    return toMediaUrl(listing.imageUrl) || '/property-placeholder.svg';
  }

  isSale(listing: ListingInterest): boolean {
    return isSaleListing(listing);
  }

  /** Title pipe input: the listing's own and translated titles. */
  titleSource(listing: ListingInterest) {
    return { title: listing.title, titleEn: listing.titleEn, titleKa: listing.titleKa, titleRu: listing.titleRu, district: listing.district };
  }

  currencySymbol(currency: string | undefined): string {
    return ({ USD: '$', EUR: '€', GEL: '₾' } as Record<string, string>)[currency || 'USD'] ?? '$';
  }

  residents(client: InterestedClient): number {
    return (Number(client.profile['adults']) || 1) + (Number(client.profile['children']) || 0);
  }

  districts(client: InterestedClient): string[] {
    const list = (client.profile['districts'] as string[] | undefined) ?? [];
    return list.filter((district) => district !== 'SelectOnMap');
  }

  pets(client: InterestedClient): string[] {
    const profile = client.profile;
    if (!profile['hasPet']) return [];
    const types = profile['petTypes'] as string[] | undefined;
    const kinds = types?.length ? types : [profile['petType'] || 'Other'];
    return kinds.filter((kind) => kind !== 'None');
  }

  priorities(client: InterestedClient): string[] {
    return ((client.profile['topPriorities'] as string[] | undefined) ?? []).slice(0, 3);
  }
}
