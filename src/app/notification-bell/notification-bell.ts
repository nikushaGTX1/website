import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { clientRelativeTime } from '../utils/client-relative-time';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClientService } from '../services/client.service';
import { ClientNotification } from '../models/client';
import { TranslationService } from '../services/translation.service';
import { toMediaUrl } from '../utils/api-media';
import { isSaleListing } from '../utils/listing-deal';
import { claimEscape, escapeAlreadyHandled } from '../utils/escape-layer';
import { CurrencyPrice } from '../currency-price/currency-price';

/** Header bell for client accounts: new-match alerts from saved Velven Match searches. */
@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.css',
  imports: [NgIf, NgFor, RouterLink, CurrencyPrice],
})
export class NotificationBell implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  open = false;
  unread = 0;
  items: ClientNotification[] = [];
  total = 0;
  page = 1;
  loading = false;
  failed = false;
  private subscription?: Subscription;
  private requests = new Subscription();

  constructor(
    private client: ClientService,
    private router: Router,
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
    readonly translation: TranslationService,
  ) {}

  ngOnInit(): void {
    this.subscription = this.client.summary$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((summary) => {
      this.unread = summary.unread;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.requests.unsubscribe();
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) this.load(1);
  }

  load(page: number): void {
    this.loading = true;
    this.failed = false;
    this.requests.add(this.client.getNotifications(page, 10).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.items = page === 1 ? result.items : [...this.items, ...result.items];
        this.total = result.total;
        this.page = page;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.failed = true;
        this.cdr.detectChanges();
      },
    }));
  }

  get hasMore(): boolean {
    return this.items.length < this.total;
  }

  /** Marks the alert read and opens Velven Discover on the right search and home (a stable link). */
  openNotification(item: ClientNotification): void {
    if (!item.readAt) {
      item.readAt = new Date().toISOString();
      this.requests.add(this.client.markRead(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {
        item.readAt = null;
        this.cdr.markForCheck();
      } }));
    }
    this.open = false;
    void this.router.navigate(['/discover'], {
      queryParams: {
        search: item.savedSearchId ?? undefined,
        apartment: item.apartment?.id ?? undefined,
      },
    });
  }

  markAllRead(): void {
    const previous = this.items.map(item => item.readAt);
    const now = new Date().toISOString();
    this.items.forEach((item) => (item.readAt ??= now));
    this.requests.add(this.client.markAllRead().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {
      this.items.forEach((item, index) => item.readAt = previous[index]);
      this.client.refreshSummary();
      this.cdr.markForCheck();
    } }));
  }

  image(item: ClientNotification): string {
    return toMediaUrl(item.apartment?.imageUrl) || '/property-placeholder.svg';
  }

  isSale(item: ClientNotification): boolean {
    return !!item.apartment && isSaleListing(item.apartment);
  }

  /** "A new 3-bedroom apartment in Vake matches your preferences." */
  summary(item: ClientNotification): string {
    const apartment = item.apartment;
    if (!apartment) return 'A new home matches your preferences.';
    const place = apartment.district || apartment.city || 'Tbilisi';
    return apartment.bedrooms
      ? `A new ${apartment.bedrooms}-bedroom apartment in ${place} matches your preferences.`
      : `A new apartment in ${place} matches your preferences.`;
  }

  relativeTime(value: string): string {
    return clientRelativeTime(value, this.translation.language$.value);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.open = false;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.open || escapeAlreadyHandled(event)) return;
    claimEscape(event);
    this.open = false;
    this.host.nativeElement.querySelector<HTMLElement>('.bell-button')?.focus();
  }
}
