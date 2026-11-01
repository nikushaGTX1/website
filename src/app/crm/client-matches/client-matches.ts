import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ClientMatchReview, ListingInterestService, ReviewStatus } from '../../services/listing-interest.service';
import { ListingTitlePipe } from '../../shared/listing-title.pipe';
import { CurrencyPrice } from '../../currency-price/currency-price';
import { answerLabel } from '../../ai-home-match/services/answer-labels';
import { toMediaUrl } from '../../utils/api-media';
import { isSaleListing } from '../../utils/listing-deal';

/**
 * CRM: client searches that match listings. The agent checks the client (call them, confirm the
 * details) and marks the match ready; only then does the owner hear about it, with the agent's phone.
 */
@Component({
  selector: 'app-client-matches',
  imports: [CommonModule, RouterLink, ListingTitlePipe, CurrencyPrice],
  templateUrl: './client-matches.html',
  styleUrl: './client-matches.css',
})
export class ClientMatches implements OnInit {
  readonly label = answerLabel;
  readonly tabs: { value: ReviewStatus; label: string; icon: string }[] = [
    { value: 'pending', label: 'To review', icon: 'fa-solid fa-hourglass-half' },
    { value: 'ready', label: 'Sent to owner', icon: 'fa-solid fa-paper-plane' },
    { value: 'dismissed', label: 'Not a fit', icon: 'fa-solid fa-ban' },
  ];
  status: ReviewStatus = 'pending';
  items: ClientMatchReview[] = [];
  loading = true;
  error = '';
  busyId: number | null = null;
  /** Message after a review, e.g. who was notified. */
  notice = '';

  constructor(private interests: ListingInterestService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  setStatus(status: ReviewStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.notice = '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.interests.getReviews(this.status).subscribe({
      next: (items) => {
        this.items = items;
        this.loading = false;
        this.cdr.markForCheck();
        if (this.status === 'pending' && items.some((item) => item.isNew)) {
          this.interests.markAllRead().subscribe({ error: () => undefined });
        }
      },
      error: (error) => {
        this.error = error?.error?.message || 'Could not load client matches.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  markReady(item: ClientMatchReview): void {
    this.review(item, true);
  }

  dismiss(item: ClientMatchReview): void {
    this.review(item, false);
  }

  private review(item: ClientMatchReview, ready: boolean): void {
    this.busyId = item.id;
    this.notice = '';
    (ready ? this.interests.markReady(item.id) : this.interests.dismiss(item.id)).subscribe({
      next: (result) => {
        this.items = this.items.filter((entry) => entry.id !== item.id);
        this.busyId = null;
        this.notice = !ready
          ? 'Marked as not a fit. The owner will not be told.'
          : result.ownerHasAccount && result.ownerEmailed
            ? 'Sent. The owner got a notification and an email with your phone number.'
            : result.ownerHasAccount
              ? 'Sent. The owner got a notification with your phone number.'
              : result.ownerEmailed
                ? 'Sent. The owner got an email with your phone number.'
                : 'Marked ready. The owner has no Velven account or email, so call them yourself.';
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.busyId = null;
        this.notice = error?.error?.message || 'Could not save. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  image(item: ClientMatchReview): string {
    return toMediaUrl(item.imageUrl) || '/property-placeholder.svg';
  }

  isSale(item: ClientMatchReview): boolean {
    return isSaleListing(item);
  }

  titleSource(item: ClientMatchReview) {
    return { title: item.title, titleEn: item.titleEn, titleKa: item.titleKa, titleRu: item.titleRu, district: item.district };
  }

  currencySymbol(currency: string | undefined): string {
    return ({ USD: '$', EUR: '€', GEL: '₾' } as Record<string, string>)[currency || 'USD'] ?? '$';
  }

  residents(item: ClientMatchReview): number {
    return (Number(item.profile['adults']) || 1) + (Number(item.profile['children']) || 0);
  }

  districts(item: ClientMatchReview): string[] {
    return ((item.profile['districts'] as string[] | undefined) ?? []).filter((district) => district !== 'SelectOnMap');
  }

  pets(item: ClientMatchReview): string[] {
    if (!item.profile['hasPet']) return [];
    const types = item.profile['petTypes'] as string[] | undefined;
    return (types?.length ? types : [item.profile['petType'] || 'Other']).filter((kind) => kind !== 'None');
  }

  whatsapp(phone: string): string {
    return 'https://wa.me/' + phone.replace(/[^\d]/g, '');
  }
}
