import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import {
  AgentReviewItem,
  RATING_LABELS,
  ReviewDashboard,
  ReviewService,
  ReviewSort,
  reviewLinkUrl,
} from '../services/review.service';

/** How often the dashboard checks for new reviews while the tab is visible. */
const POLL_MS = 20000;

/**
 * The signed-in agent's client reviews: shareable link, average, distribution,
 * filter by stars, sort, and new reviews appearing without a manual refresh.
 */
@Component({
  selector: 'app-my-reviews',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-reviews.html',
  styleUrl: './my-reviews.css',
})
export class MyReviews implements OnInit, OnDestroy {
  readonly stars = [1, 2, 3, 4, 5];
  readonly labels = RATING_LABELS;

  data: ReviewDashboard | null = null;
  loading = true;
  refreshing = false;
  error = '';
  ratingFilter: number | null = null;
  sort: ReviewSort = 'newest';
  copied = false;
  copyFailed = false;
  newCount = 0;
  /** Reviews that arrived while the page was open; highlighted until the next filter change. */
  freshIds = new Set<string>();

  private knownIds = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private request?: Subscription;
  private copiedTimer?: ReturnType<typeof setTimeout>;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') this.load(true);
  };

  constructor(
    private readonly reviews: ReviewService,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load(false);
    // Poll outside Angular so the interval does not keep the app "unstable".
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => {
        if (document.visibilityState === 'visible') this.zone.run(() => this.load(true));
      }, POLL_MS);
    });
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    clearTimeout(this.copiedTimer);
    this.request?.unsubscribe();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  get link(): string {
    return this.data ? reviewLinkUrl(this.data.slug) : '';
  }

  get average(): number {
    return this.data?.summary.average ?? 0;
  }

  get total(): number {
    return this.data?.summary.total ?? 0;
  }

  /** Counts from 5 stars down to 1, for the distribution chart. */
  get distribution(): Array<{ stars: number; count: number; percent: number }> {
    const counts = this.data?.summary.distribution ?? [0, 0, 0, 0, 0];
    const total = this.total || 1;
    return [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: counts[stars - 1] ?? 0,
      percent: Math.round(((counts[stars - 1] ?? 0) / total) * 100),
    }));
  }

  get whatsappHref(): string {
    const text = `Hi! Could you rate your experience with me on Velven? It takes less than a minute: ${this.link}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  get canShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  /** Fill level (0–100) of each star for the average, e.g. 4.5 → last star half full. */
  starFill(star: number): number {
    return Math.max(0, Math.min(1, this.average - (star - 1))) * 100;
  }

  load(background: boolean): void {
    if (background && (this.loading || this.refreshing)) return;
    if (background) this.refreshing = true;
    else {
      this.loading = !this.data;
      this.error = '';
    }
    this.request?.unsubscribe();
    this.request = this.reviews.getMine(this.ratingFilter, this.sort).subscribe({
      next: (data) => {
        // Reviews never seen before on a background refresh are "new".
        if (background && this.knownIds.size) {
          const arrived = data.reviews.filter((review) => !this.knownIds.has(review.id));
          arrived.forEach((review) => this.freshIds.add(review.id));
          this.newCount += arrived.length;
        }
        data.reviews.forEach((review) => this.knownIds.add(review.id));
        this.data = data;
        this.loading = false;
        this.refreshing = false;
        this.error = '';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.refreshing = false;
        // A failed background refresh keeps the current list; only the first load shows an error.
        if (!background || !this.data) {
          this.error =
            error.status === 403
              ? 'Reviews are available for Velven agents only.'
              : error.status === 0
                ? 'No connection. Check your internet and try again.'
                : 'Reviews could not be loaded. Please try again.';
        }
        this.cdr.detectChanges();
      },
    });
  }

  setFilter(rating: number | null): void {
    if (this.ratingFilter === rating) rating = null;
    this.ratingFilter = rating;
    this.load(false);
  }

  setSort(sort: ReviewSort): void {
    this.sort = sort;
    this.load(false);
  }

  dismissNew(): void {
    this.newCount = 0;
    this.freshIds.clear();
  }

  async copyLink(): Promise<void> {
    const text = this.link;
    if (!text) return;
    // Copy synchronously first, while the click still counts as a user gesture; the async
    // Clipboard API can stay pending (permission prompt), so it is only the fallback.
    let ok = this.copyWithTextarea(text);
    if (!ok) {
      try {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
        ]);
        ok = true;
      } catch {
        ok = false;
      }
    }
    this.copied = ok;
    this.copyFailed = !ok;
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      this.copied = false;
      this.copyFailed = false;
      this.cdr.detectChanges();
    }, 2200);
    this.cdr.detectChanges();
  }

  private copyWithTextarea(text: string): boolean {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length); // iOS
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }

  async share(): Promise<void> {
    try {
      await navigator.share({
        title: 'Rate your experience',
        text: 'Could you rate your experience with me on Velven? It takes less than a minute.',
        url: this.link,
      });
    } catch {
      // Cancelled by the user; nothing to do.
    }
  }

  displayName(review: AgentReviewItem): string {
    return review.customerName?.trim() || 'Anonymous client';
  }

  initial(review: AgentReviewItem): string {
    return (review.customerName?.trim() || '?').charAt(0).toUpperCase();
  }

  trackById(_: number, review: AgentReviewItem): string {
    return review.id;
  }
}
