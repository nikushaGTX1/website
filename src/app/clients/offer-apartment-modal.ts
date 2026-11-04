import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { answerLabel } from '../ai-home-match/services/answer-labels';
import { Apartment } from '../models/apartment';
import { ApartmentService } from '../services/apartment.service';
import { ApartmentOfferService } from '../services/apartment-offer.service';
import { AuthService } from '../services/auth.service';
import { BoardClient } from '../services/client-board.service';
import { claimEscape, escapeAlreadyHandled } from '../utils/escape-layer';
import { lockPageScroll, unlockPageScroll } from '../utils/page-scroll-lock';

@Component({
  selector: 'app-offer-apartment-modal',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './offer-apartment-modal.html',
  styleUrl: './offer-apartment-modal.css',
})
export class OfferApartmentModal implements OnInit, OnDestroy {
  @Input({ required: true }) client!: BoardClient;
  @Input() goal: 'Rent' | 'Buy' = 'Rent';
  /** Example cards are not real clients: the modal shows them but cannot send. */
  @Input() example = false;
  @Input() uploadParams: Record<string, unknown> = {};
  @Output() closed = new EventEmitter<void>();

  readonly label = answerLabel;
  listings: Apartment[] = [];
  loading = true;
  loadFailed = false;
  apartmentId: number | null = null;
  share = true;
  submitting = false;
  submitted = false;
  error = '';
  private requests = new Subscription();

  constructor(
    private apartments: ApartmentService,
    private offers: ApartmentOfferService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    // On <body> so it covers the site header; Angular still removes the host when it closes.
    document.body.appendChild(this.host.nativeElement);
    lockPageScroll();
    if (!this.example) this.loadListings();
    else this.loading = false;
  }

  ngOnDestroy(): void {
    unlockPageScroll();
    this.requests.unsubscribe();
  }

  loadListings(): void {
    if (!this.auth.isLoggedIn) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.loadFailed = false;
    this.requests.add(this.apartments.getMyApartments().subscribe({
      next: (items) => {
        this.listings = items;
        if (items.length === 1) this.apartmentId = items[0].id;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadFailed = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
    }));
  }

  get loggedIn(): boolean {
    return this.auth.isLoggedIn;
  }

  get canSend(): boolean {
    return !this.example && this.loggedIn && !this.loading && !this.loadFailed && this.listings.length > 0;
  }

  get currency(): string {
    return ({ USD: '$', EUR: '€', GEL: '₾' } as Record<string, string>)[this.client.profile.currency] ?? '';
  }

  get residents(): number {
    return this.client.profile.adults + this.client.profile.children;
  }

  signIn(): void {
    this.closed.emit();
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/clients' } });
  }

  send(): void {
    if (this.submitting || !this.canSend) return;
    if (this.apartmentId === null) {
      this.error = 'Please choose an apartment.';
      return;
    }
    this.submitting = true;
    this.error = '';
    this.requests.add(this.offers.submit(this.client.id, this.apartmentId, this.share).subscribe({
      next: () => {
        this.submitting = false;
        this.submitted = true;
        this.cdr.markForCheck();
      },
      error: (response) => {
        this.submitting = false;
        const code = response?.error?.code;
        this.error = code === 'already_offered' ? 'You have already offered this apartment to this client.'
          : code === 'client_not_found' ? 'This client is no longer available.'
          : code === 'apartment_not_found' ? 'This apartment could not be offered.'
          : response?.status === 429 ? 'Too many attempts. Please try again later.'
          : 'Something went wrong. Please try again.';
        this.cdr.markForCheck();
      },
    }));
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (escapeAlreadyHandled(event)) return;
    claimEscape(event);
    this.closed.emit();
  }
}
