import { LocalizedAddressPipe } from '../shared/localized-address.pipe';
import { LandAreaPipe } from '../utils/land-area';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Apartment } from '../models/apartment';
import { User } from '../models/user';
import { ApartmentService } from '../services/apartment.service';
import { AuthService } from '../services/auth.service';
import { PendingApartment, PendingApartmentService } from '../services/pending-apartment.service';
import { NgIf, NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { isSaleListing } from '../utils/listing-deal';
import { CurrencyPrice } from '../currency-price/currency-price';
import { PhotoUrlPipe } from '../shared/photo-url.pipe';

@Component({
  selector: 'app-my-listings',
  templateUrl: './my-listings.html',
  styleUrl: './my-listings.css',
  imports: [LocalizedAddressPipe, LandAreaPipe, PhotoUrlPipe, NgIf, RouterLink, NgFor, CurrencyPrice],
})
export class MyListings implements OnInit, OnDestroy {
  user: User | null = null;
  listings: Apartment[] = [];
  awaitingReview: Apartment[] = [];
  pendingListings: PendingApartment[] = [];
  loading = false;
  saving = false;
  successMessage = '';
  errorMessage = '';
  private subscriptions = new Subscription();

  constructor(
    private apartmentService: ApartmentService,
    private authService: AuthService,
    private pendingService: PendingApartmentService,
  ) {}

  ngOnInit(): void {
    this.user = this.authService.currentUser;
    this.subscriptions.add(
      this.authService.currentUser$.subscribe((user) => {
        this.user = user;
        this.pendingListings = this.pendingService.getForUser(user);
        this.loadListings();
      }),
    );

    this.subscriptions.add(
      this.pendingService.pendingApartments$.subscribe(() => {
        this.pendingListings = this.pendingService.getForUser(this.user);
      }),
    );
  }

  /** Admins, managers and agents can delete; the API only lets agents delete listings they uploaded. */
  /** Rentals not confirmed for this many days are marked red. */
  readonly staleDays = 6;
  confirmingId: number | null = null;

  /** Days since the rental was last confirmed (or published). 0 for sales. */
  daysSinceConfirmed(apartment: Apartment): number {
    if (isSaleListing(apartment)) return 0;
    const stamp = apartment.lastConfirmedAt || apartment.publishedAt || apartment.createdAt;
    const time = stamp ? new Date(stamp).getTime() : NaN;
    return Number.isNaN(time) ? 0 : Math.floor((Date.now() - time) / 86_400_000);
  }

  needsAttention(apartment: Apartment): boolean {
    return this.daysSinceConfirmed(apartment) >= this.staleDays;
  }

  get attentionCount(): number {
    return this.listings.filter((apartment) => this.needsAttention(apartment)).length;
  }

  confirmAvailable(apartment: Apartment): void {
    if (this.confirmingId) return;
    this.confirmingId = apartment.id;
    this.apartmentService.confirmAvailable(apartment.id).subscribe({
      next: ({ lastConfirmedAt }) => {
        apartment.lastConfirmedAt = lastConfirmedAt;
        this.confirmingId = null;
      },
      error: () => {
        this.confirmingId = null;
      },
    });
  }

  get canDelete(): boolean {
    // Every listing here is the user's own (uploaded or offered as owner), so anyone signed in may delete it.
    return this.authService.isLoggedIn;
  }

  get isStaff(): boolean {
    return this.authService.isAgent || this.authService.isAdmin || this.authService.isCrmManager;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadListings(): void {
    this.loading = true;
    this.errorMessage = '';

    // Ownership comes from the API: the public list hides who uploaded each listing,
    // so approved uploads never matched here before.
    this.apartmentService.getMyApartments().subscribe({
      next: (apartments) => {
        this.listings = apartments.filter((apartment) => apartment.isApproved !== false);
        this.awaitingReview = apartments.filter((apartment) => apartment.isApproved === false);
        this.loading = false;
      },
      error: () => {
        this.listings = [];
        this.loading = false;
        this.errorMessage = 'Could not load your listings right now.';
      },
    });
  }

  deletePendingListing(request: PendingApartment): void {
    if (!confirm(`Delete "${request.apartment.title}"?`)) return;

    if (this.pendingService.remove(request.id)) {
      this.successMessage = 'Upload request deleted.';
      this.errorMessage = '';
    }
  }

  deleteListing(apartment: Apartment): void {
    if (!confirm(`Delete "${apartment.title}"?`)) {
      return;
    }

    this.apartmentService.deleteApartment(apartment.id).subscribe({
      next: () => {
        this.successMessage = 'Listing deleted.';
        this.listings = this.listings.filter((item) => item.id !== apartment.id);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.getApiError(error, 'Could not delete this listing.');
      },
    });
  }

  getStatusLabel(status: PendingApartment['status']): string {
    if (status === 'pending') return 'Waiting for agent';
    if (status === 'approved') return 'Approved';
    return 'Declined';
  }

  private getApiError(error: HttpErrorResponse, fallback: string): string {
    const apiMessage =
      typeof error.error === 'string' ? error.error : error.error?.message || error.error?.title;

    if (error.status === 401) return 'Your session expired. Please sign in again.';
    if (error.status === 403) return 'You do not have permission to change this listing.';
    return apiMessage || `${fallback} (HTTP ${error.status || 'network error'})`;
  }
}
