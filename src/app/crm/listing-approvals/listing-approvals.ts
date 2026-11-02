import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApartmentService, PendingApartmentEntry } from '../../services/apartment.service';
import { ListingTitlePipe } from '../../shared/listing-title.pipe';
import { CurrencyPrice } from '../../currency-price/currency-price';
import { toMediaUrl } from '../../utils/api-media';
import { isSaleListing } from '../../utils/listing-deal';
import { clientRelativeTime } from '../../utils/client-relative-time';
import { TranslationService } from '../../services/translation.service';

/**
 * CRM (managers and admins): listings agents uploaded that wait for approval. Approve publishes
 * the listing; Decline deletes it, so it asks for a second click first.
 */
@Component({
  selector: 'app-listing-approvals',
  imports: [CommonModule, RouterLink, ListingTitlePipe, CurrencyPrice],
  templateUrl: './listing-approvals.html',
  styleUrl: './listing-approvals.css',
})
export class ListingApprovals implements OnInit {
  items: PendingApartmentEntry[] = [];
  loading = true;
  error = '';
  busyId: number | null = null;
  confirmDeclineId: number | null = null;
  notice = '';
  search = '';

  constructor(
    private apartments: ApartmentService,
    private translation: TranslationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.apartments.getPendingApartments().subscribe({
      next: (items) => {
        this.items = items
          .filter((item) => item.status === 'pending')
          .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.error = error?.error?.message || 'Could not load listings waiting for approval.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get visible(): PendingApartmentEntry[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter((item) =>
      [item.apartment.title, item.apartment.district, item.apartment.street, item.submittedByName, item.submittedByEmail, item.submittedByPhone]
        .some((value) => String(value || '').toLowerCase().includes(q)));
  }

  approve(item: PendingApartmentEntry): void {
    if (this.busyId) return;
    this.busyId = item.id;
    this.notice = '';
    this.apartments.approveApartment(item.id).subscribe({
      next: () => this.done(item, 'Listing approved and published.'),
      error: () => this.fail('Could not publish this listing. Please try again.'),
    });
  }

  askDecline(item: PendingApartmentEntry): void {
    this.confirmDeclineId = item.id;
    this.notice = '';
  }

  decline(item: PendingApartmentEntry): void {
    if (this.busyId) return;
    this.busyId = item.id;
    this.apartments.deleteApartment(item.id).subscribe({
      next: () => this.done(item, 'Listing declined and removed.'),
      error: () => this.fail('Could not decline this listing. Please try again.'),
    });
  }

  private done(item: PendingApartmentEntry, message: string): void {
    this.items = this.items.filter((entry) => entry.id !== item.id);
    this.busyId = null;
    this.confirmDeclineId = null;
    this.notice = message;
    this.cdr.markForCheck();
  }

  private fail(message: string): void {
    this.busyId = null;
    this.notice = message;
    this.cdr.markForCheck();
  }

  image(item: PendingApartmentEntry): string {
    const apartment = item.apartment;
    return toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) || '/property-placeholder.svg';
  }

  photo(item: PendingApartmentEntry): string {
    return item.submittedByPicture ? toMediaUrl(item.submittedByPicture) || item.submittedByPicture : '';
  }

  initials(item: PendingApartmentEntry): string {
    return (item.submittedByName || item.submittedByEmail || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  isSale(item: PendingApartmentEntry): boolean {
    return isSaleListing(item.apartment);
  }

  submitted(item: PendingApartmentEntry): string {
    return item.submittedAt ? clientRelativeTime(item.submittedAt, this.translation.language$.value) : '';
  }
}
