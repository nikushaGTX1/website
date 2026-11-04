import { ChangeDetectorRef, Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApartmentOfferMatchItem, ApartmentOfferReview, ApartmentOfferService, OfferStatus } from '../../services/apartment-offer.service';
import { ListingInterestService } from '../../services/listing-interest.service';
import { CurrencyPrice } from '../../currency-price/currency-price';

/** CRM: apartments users offered to a client. Nothing reaches a client before the agent approves. */
@Component({
  selector: 'app-apartment-offers',
  imports: [CommonModule, RouterLink, CurrencyPrice],
  templateUrl: './apartment-offers.html',
  styleUrl: './apartment-offers.css',
})
export class ApartmentOffers implements OnInit {
  readonly tabs: { value: OfferStatus; label: string }[] = [
    { value: 'pending', label: 'To review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];
  status: OfferStatus = 'pending';
  items: ApartmentOfferReview[] = [];
  matches: ApartmentOfferMatchItem[] = [];
  focusId: number | null = null;
  loading = true;
  error = '';
  actionError = '';
  notice = '';
  busyId: number | null = null;
  matchedCount: number | null = null;
  private reviewRequest?: Subscription;

  constructor(
    private offers: ApartmentOfferService,
    private interests: ListingInterestService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private destroyRef: DestroyRef,
  ) {}

  ngOnInit(): void {
    const offer = Number(this.route.snapshot.queryParamMap.get('offer'));
    this.focusId = Number.isInteger(offer) && offer > 0 ? offer : null;
    this.load();
    this.offers.matches().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (matches) => {
        this.matches = matches;
        for (const match of matches)
          this.interests.markRead(match.id, 'apartment-offer-match').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
        this.cdr.markForCheck();
      },
      error: () => undefined,
    });
  }

  setStatus(status: OfferStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.notice = '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.actionError = '';
    this.reviewRequest?.unsubscribe();
    this.reviewRequest = this.offers.reviews(this.status).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.items = items;
        this.loading = false;
        this.cdr.markForCheck();
        for (const item of items.filter((row) => row.isNew && row.status === 'pending'))
          this.interests.markRead(item.id, 'apartment-offer').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
      },
      error: () => {
        this.error = 'Offers could not be loaded.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  review(item: ApartmentOfferReview, action: 'approve' | 'reject'): void {
    if (this.busyId !== null) return;
    this.busyId = item.id;
    this.actionError = '';
    this.offers[action](item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.busyId = null;
        this.items = this.items.filter((row) => row.id !== item.id);
        this.matchedCount = action === 'approve' && item.shareWithOtherClients ? result.matchedClients : null;
        this.notice = action === 'reject' ? 'Offer rejected.' : item.shareWithOtherClients
          ? 'Offer approved. Compatible other clients:'
          : 'Offer approved for the selected client only.';
        this.cdr.markForCheck();
      },
      error: (response) => {
        this.busyId = null;
        this.actionError = response?.status === 409 ? 'This offer was already reviewed.' : 'The review could not be saved.';
        this.cdr.markForCheck();
      },
    });
  }
}
