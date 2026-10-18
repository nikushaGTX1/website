import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { ReviewLink, ReviewService } from '../services/review.service';
import { AppLanguage, TranslationService } from '../services/translation.service';
import { pick, ratingLabel, reviewSubmitError, ruPlural, starsText } from '../utils/review-i18n';

/**
 * Public review form behind an agent's permanent link (velven.ge/review/{slug}).
 * No sign-in: the client picks 1–5 stars, optionally adds a comment and name, and submits.
 */
@Component({
  selector: 'app-review-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './review-page.html',
  styleUrl: './review-page.css',
})
export class ReviewPage implements OnInit, OnDestroy {
  readonly stars = [1, 2, 3, 4, 5];
  readonly maxComment = 1000;
  readonly maxName = 60;

  link: ReviewLink | null = null;
  loading = true;
  notFound = false;
  loadFailed = false;

  rating = 0;
  hover = 0;
  comment = '';
  customerName = '';
  /** Honeypot: hidden from people, filled by simple bots. */
  website = '';
  submitting = false;
  submitted = false;
  submitError = '';
  ratingMissing = false;

  private slug = '';
  private readonly openedAt = Date.now();
  /** One id per form: retries and double clicks are stored once by the API. */
  private readonly submissionId = crypto.randomUUID();
  private lastError?: { status: number; message?: string };
  private languageSubscription?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly reviews: ReviewService,
    private readonly translation: TranslationService,
    private readonly title: Title,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.slug = (this.route.snapshot.paramMap.get('slug') || '').trim().toLowerCase();
    // Re-render (and re-word any shown error) when the visitor switches language.
    this.languageSubscription = this.translation.language$.subscribe(() => {
      if (this.lastError) this.submitError = reviewSubmitError(this.lang, this.lastError.status, this.lastError.message);
      this.updateTitle();
      this.cdr.markForCheck();
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.languageSubscription?.unsubscribe();
  }

  get lang(): AppLanguage {
    return this.translation.language$.value;
  }

  t(en: string, ka: string, ru: string): string {
    return pick(this.lang, en, ka, ru);
  }

  load(): void {
    this.loading = true;
    this.loadFailed = false;
    this.notFound = false;
    this.reviews.getLink(this.slug).subscribe({
      next: (link) => {
        this.link = link;
        this.loading = false;
        this.updateTitle();
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.status === 404 || error.status === 400) this.notFound = true;
        else this.loadFailed = true;
        this.cdr.detectChanges();
      },
    });
  }

  /** Stars shown as filled: the hovered one while previewing, otherwise the chosen one. */
  get shownRating(): number {
    return this.hover || this.rating;
  }

  /** "4 Stars — Good", or the prompt before any star is chosen. */
  get ratingText(): string {
    const shown = this.shownRating;
    if (!shown) return this.t('Tap a star to rate', 'შესაფასებლად აირჩიეთ ვარსკვლავი', 'Нажмите на звезду, чтобы оценить');
    return `${starsText(this.lang, shown)} — ${ratingLabel(this.lang, shown)}`;
  }

  starAria(star: number): string {
    return this.t(
      `${star} ${star === 1 ? 'star' : 'stars'}`,
      `${star} ვარსკვლავი`,
      `${star} ${ruPlural(star, 'звезда', 'звезды', 'звёзд')}`,
    );
  }

  select(star: number): void {
    this.rating = star;
    this.ratingMissing = false;
    this.submitError = '';
    this.lastError = undefined;
  }

  /** Arrow keys move the rating like a radio group. */
  onStarKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, (this.rating || (step > 0 ? 0 : 6)) + step));
    this.select(next);
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button')[next - 1]?.focus();
  }

  submit(): void {
    if (this.submitting || this.submitted) return;
    if (!this.rating) {
      this.ratingMissing = true;
      return;
    }
    this.submitting = true;
    this.submitError = '';
    this.lastError = undefined;
    this.reviews
      .submit(this.slug, {
        rating: this.rating,
        comment: this.comment.trim() || undefined,
        customerName: this.customerName.trim() || undefined,
        submissionId: this.submissionId,
        elapsedMs: Date.now() - this.openedAt,
        website: this.website || undefined,
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.submitted = true;
          this.cdr.detectChanges();
        },
        error: (error: HttpErrorResponse) => {
          this.submitting = false;
          this.lastError = { status: error.status, message: error.error?.message };
          this.submitError = reviewSubmitError(this.lang, error.status, error.error?.message);
          this.cdr.detectChanges();
        },
      });
  }

  private updateTitle(): void {
    if (!this.link) return;
    const name = this.link.agentName;
    this.title.setTitle(this.t(`Review ${name} | Velven`, `შეაფასეთ ${name} | Velven`, `Отзыв: ${name} | Velven`));
  }
}
