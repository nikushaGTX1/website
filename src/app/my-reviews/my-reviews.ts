import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import {
  AgentReviewItem,
  ReviewDashboard,
  ReviewService,
  ReviewSort,
  reviewLinkUrl,
} from '../services/review.service';
import { AppLanguage, TranslationService } from '../services/translation.service';
import { formatReviewDate, pick, ratingLabel, reviewsText, ruPlural, starsText } from '../utils/review-i18n';

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

  data: ReviewDashboard | null = null;
  loading = true;
  refreshing = false;
  /** Why the first load failed; worded in the current language by errorText. */
  errorKind: '' | 'forbidden' | 'offline' | 'failed' = '';
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
  private languageSubscription?: Subscription;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') this.load(true);
  };

  constructor(
    private readonly reviews: ReviewService,
    private readonly translation: TranslationService,
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
    this.languageSubscription = this.translation.language$.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    clearTimeout(this.copiedTimer);
    this.request?.unsubscribe();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.languageSubscription?.unsubscribe();
  }

  get lang(): AppLanguage {
    return this.translation.language$.value;
  }

  t(en: string, ka: string, ru: string): string {
    return pick(this.lang, en, ka, ru);
  }

  get errorText(): string {
    switch (this.errorKind) {
      case 'forbidden':
        return this.t('Reviews are available for Velven agents only.', 'შეფასებები ხელმისაწვდომია მხოლოდ Velven-ის აგენტებისთვის.', 'Отзывы доступны только агентам Velven.');
      case 'offline':
        return this.t('No connection. Check your internet and try again.', 'კავშირი არ არის. შეამოწმეთ ინტერნეტი და სცადეთ ხელახლა.', 'Нет подключения. Проверьте интернет и попробуйте снова.');
      case 'failed':
        return this.t('Reviews could not be loaded. Please try again.', 'შეფასებების ჩატვირთვა ვერ მოხერხდა. სცადეთ ხელახლა.', 'Не удалось загрузить отзывы. Попробуйте снова.');
      default:
        return '';
    }
  }

  get totalText(): string {
    return reviewsText(this.lang, this.total);
  }

  get newText(): string {
    const n = this.newCount;
    return this.t(
      `${n} new ${n === 1 ? 'review' : 'reviews'} just arrived`,
      `მოვიდა ${n} ახალი შეფასება`,
      `${n} ${ruPlural(n, 'новый отзыв', 'новых отзыва', 'новых отзывов')}`,
    );
  }

  label(rating: number): string {
    return ratingLabel(this.lang, rating);
  }

  barAria(stars: number, count: number): string {
    return `${starsText(this.lang, stars)}: ${reviewsText(this.lang, count)}`;
  }

  noneForFilterText(stars: number | null): string {
    return this.t(
      `No ${stars}-star reviews yet.`,
      `${stars}-ვარსკვლავიანი შეფასებები ჯერ არ არის.`,
      `Отзывов с оценкой ${stars} пока нет.`,
    );
  }

  date(review: AgentReviewItem): string {
    return formatReviewDate(this.lang, review.createdAt, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
    const text = this.t(
      `Hi! Could you rate your experience with me on Velven? It takes less than a minute: ${this.link}`,
      `გამარჯობა! შეგიძლიათ შეაფასოთ ჩემთან თანამშრომლობა Velven-ზე? ერთ წუთზე ნაკლებს დაიკავებს: ${this.link}`,
      `Здравствуйте! Оцените, пожалуйста, работу со мной на Velven — это займёт меньше минуты: ${this.link}`,
    );
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
      this.errorKind = '';
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
        this.errorKind = '';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.refreshing = false;
        // A failed background refresh keeps the current list; only the first load shows an error.
        if (!background || !this.data) {
          this.errorKind = error.status === 403 ? 'forbidden' : error.status === 0 ? 'offline' : 'failed';
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
        title: this.t('Rate your experience', 'შეაფასეთ თანამშრომლობა', 'Оцените работу'),
        text: this.t(
          'Could you rate your experience with me on Velven? It takes less than a minute.',
          'შეგიძლიათ შეაფასოთ ჩემთან თანამშრომლობა Velven-ზე? ერთ წუთზე ნაკლებს დაიკავებს.',
          'Оцените, пожалуйста, работу со мной на Velven — это займёт меньше минуты.',
        ),
        url: this.link,
      });
    } catch {
      // Cancelled by the user; nothing to do.
    }
  }

  displayName(review: AgentReviewItem): string {
    return review.customerName?.trim() || this.t('Anonymous client', 'ანონიმური კლიენტი', 'Анонимный клиент');
  }

  initial(review: AgentReviewItem): string {
    return (review.customerName?.trim() || '?').charAt(0).toUpperCase();
  }

  trackById(_: number, review: AgentReviewItem): string {
    return review.id;
  }
}
