import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Apartment, CreateApartment } from '../models/apartment';
import { User } from '../models/user';
import { ApartmentService } from '../services/apartment.service';
import { AuthService } from '../services/auth.service';
import { PendingApartment, PendingApartmentService } from '../services/pending-apartment.service';

@Component({
  selector: 'app-my-listings',
  standalone: false,
  templateUrl: './my-listings.html',
  styleUrl: './my-listings.css',
})
export class MyListings implements OnInit, OnDestroy {
  user: User | null = null;
  listings: Apartment[] = [];
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
      })
    );

    this.subscriptions.add(
      this.pendingService.pendingApartments$.subscribe(() => {
        this.pendingListings = this.pendingService.getForUser(this.user);
      })
    );

  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadListings(): void {
    this.loading = true;
    this.errorMessage = '';

    this.apartmentService.getApartments().subscribe({
      next: (apartments) => {
        this.listings = apartments.filter((apartment) => this.isMine(apartment));
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

  private isMine(apartment: Apartment): boolean {
    if (!this.user) return false;

    const userId = (this.user.id || '').toLowerCase();
    const userEmail = this.user.email.toLowerCase();
    const ownerIds = [
      apartment.userId,
      apartment.ownerId,
      apartment.createdById,
      apartment.applicationUserId,
    ]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase());

    const ownerEmails = [apartment.userEmail, apartment.createdByEmail]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase());

    const description = apartment.description?.toLowerCase() || '';
    const approvedRequests = this.pendingService
      .getForUser(this.user)
      .filter((request) => request.status === 'approved');
    const linkedByPublishedId = approvedRequests.some(
      (request) => request.publishedApartmentId === apartment.id,
    );
    const linkedByOriginalListing = approvedRequests.some(
      (request) => this.isSameListing(request.apartment, apartment),
    );

    return (
      linkedByPublishedId ||
      linkedByOriginalListing ||
      (!!userId && ownerIds.includes(userId)) ||
      ownerEmails.includes(userEmail) ||
      description.includes(`email: ${userEmail}`) ||
      description.includes(userEmail)
    );
  }

  private isSameListing(request: CreateApartment, apartment: Apartment): boolean {
    const normalize = (value?: string): string => (value || '').trim().toLowerCase();

    return (
      normalize(request.title) === normalize(apartment.title) &&
      Number(request.price) === Number(apartment.price) &&
      normalize(request.address) === normalize(apartment.address)
    );
  }

  private getApiError(error: HttpErrorResponse, fallback: string): string {
    const apiMessage =
      typeof error.error === 'string'
        ? error.error
        : error.error?.message || error.error?.title;

    if (error.status === 401) return 'Your session expired. Please sign in again.';
    if (error.status === 403) return 'You do not have permission to change this listing.';
    return apiMessage || `${fallback} (HTTP ${error.status || 'network error'})`;
  }
}
