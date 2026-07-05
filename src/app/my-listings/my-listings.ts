import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
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
    this.successMessage = '';
    this.errorMessage = '';
    this.editForm = {
      title: apartment.title,
      description: apartment.description,
      price: apartment.price,
      address: apartment.address || '',
      imageUrl: apartment.imageUrl || '',
      imageUrls: apartment.imageUrls || [],
    };
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editForm = this.createEmptyForm();
  }

  saveEdit(apartment: Apartment): void {
    if (this.saving) return;

    this.successMessage = '';
    this.errorMessage = '';

    if (!this.editForm.title.trim() || !this.editForm.price) {
      this.errorMessage = 'Title and price are required.';
      return;
    }

    this.saving = true;

    this.apartmentService.updateApartment(apartment.id, {
      title: this.editForm.title.trim(),
      description: this.editForm.description.trim(),
      price: Number(this.editForm.price),
      address: this.editForm.address?.trim(),
      imageUrl: this.editForm.imageUrl?.trim() || undefined,
      imageUrls: this.editForm.imageUrls,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = 'Listing updated.';
        this.cancelEdit();
        this.loadListings();
      },
      error: () => {
        this.saving = false;
        this.errorMessage = 'Could not update this listing.';
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
      error: () => {
        this.errorMessage = 'Could not delete this listing.';
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

    return (
      (!!userId && ownerIds.includes(userId)) ||
      ownerEmails.includes(userEmail) ||
      description.includes(`email: ${userEmail}`) ||
      description.includes(userEmail)
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
}
