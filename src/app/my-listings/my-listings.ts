import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Apartment, CreateApartment } from '../models/apartment';
import { User } from '../models/user';
import { ApartmentService } from '../services/apartment.service';
import { AuthService } from '../services/auth.service';
import { PendingApartment, PendingApartmentService } from '../services/pending-apartment.service';

type ListingForm = CreateApartment;

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
  editingId: number | null = null;
  editingPendingId: string | null = null;
  editForm: ListingForm = this.createEmptyForm();

  loading = false;
  saving = false;
  successMessage = '';
  errorMessage = '';

  private subscriptions = new Subscription();

  constructor(
    private apartmentService: ApartmentService,
    private authService: AuthService,
    private pendingService: PendingApartmentService
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

  startEdit(apartment: Apartment): void {
    this.editingId = apartment.id;
    this.editingPendingId = null;
    this.successMessage = '';
    this.errorMessage = '';
    this.editForm = this.toListingForm(apartment);
  }

  startPendingEdit(request: PendingApartment): void {
    this.editingId = null;
    this.editingPendingId = request.id;
    this.successMessage = '';
    this.errorMessage = '';
    this.editForm = this.toListingForm(request.apartment);
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editingPendingId = null;
    this.editForm = this.createEmptyForm();
  }

  savePendingEdit(request: PendingApartment): void {
    if (!this.validateForm()) return;

    this.pendingService.updateSubmission(request.id, this.normalizedForm());
    this.successMessage = 'Changes saved and sent for approval.';
    this.errorMessage = '';
    this.cancelEdit();
  }

  deletePendingListing(request: PendingApartment): void {
    if (!confirm(`Delete "${request.apartment.title}"?`)) return;

    if (this.pendingService.remove(request.id)) {
      this.successMessage = 'Upload request deleted.';
      this.errorMessage = '';
      this.cancelEdit();
    }
  }

  saveEdit(apartment: Apartment): void {
    if (this.saving) return;

    this.successMessage = '';
    this.errorMessage = '';

    if (!this.validateForm()) return;

    this.saving = true;

    this.apartmentService.updateApartment(apartment.id, this.normalizedForm()).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = 'Listing updated.';
        this.cancelEdit();
        this.loadListings();
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.errorMessage = this.getApiError(error, 'Could not update this listing.');
      },
    });
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

  onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.editForm.imageFiles = Array.from(input.files || []).slice(0, 15);
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

  private createEmptyForm(): ListingForm {
    return {
      title: '',
      description: '',
      price: 0,
      address: '',
      imageUrl: '',
      imageUrls: [],
    };
  }

  private toListingForm(apartment: Partial<Apartment & CreateApartment>): ListingForm {
    return {
      title: apartment.title || '',
      description: apartment.description || '',
      price: Number(apartment.price) || 0,
      address: apartment.address || '',
      city: apartment.city || 'Tbilisi',
      district: apartment.district || '',
      bedrooms: apartment.bedrooms ?? 0,
      bathrooms: apartment.bathrooms ?? 0,
      sizeSquareMeters: apartment.sizeSquareMeters ?? 0,
      floor: apartment.floor ?? 0,
      totalFloors: apartment.totalFloors ?? 1,
      hasElevator: !!apartment.hasElevator,
      hasParking: !!apartment.hasParking,
      hasBalcony: !!apartment.hasBalcony,
      hasBathtub: !!apartment.hasBathtub,
      hasAirConditioning: !!apartment.hasAirConditioning,
      hasDishwasher: !!apartment.hasDishwasher,
      isPetFriendly: !!apartment.isPetFriendly,
      hasHomeOfficeSpace: !!apartment.hasHomeOfficeSpace,
      hasLargeKitchen: !!apartment.hasLargeKitchen,
      hasView: !!apartment.hasView,
      isFurnished: !!apartment.isFurnished,
      apartmentStyle: apartment.apartmentStyle || '',
      imageUrl: apartment.imageUrl || '',
      imageUrls: [...(apartment.imageUrls || [])],
    };
  }

  private validateForm(): boolean {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.editForm.title.trim() || Number(this.editForm.price) <= 0) {
      this.errorMessage = 'Title and a valid price are required.';
      return false;
    }

    return true;
  }

  private normalizedForm(): ListingForm {
    return {
      ...this.editForm,
      title: this.editForm.title.trim(),
      description: this.editForm.description.trim(),
      price: Number(this.editForm.price),
      address: this.editForm.address?.trim(),
      city: this.editForm.city?.trim() || 'Tbilisi',
      district: this.editForm.district?.trim() || this.editForm.address?.trim() || 'Tbilisi',
      bedrooms: Number(this.editForm.bedrooms) || 0,
      bathrooms: Number(this.editForm.bathrooms) || 0,
      sizeSquareMeters: Number(this.editForm.sizeSquareMeters) || 0,
      floor: Number(this.editForm.floor) || 0,
      totalFloors: Math.max(1, Number(this.editForm.totalFloors) || 1),
      imageUrl: this.editForm.imageUrl?.trim() || undefined,
    };
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
