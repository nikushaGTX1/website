import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { RATING_LABELS, ReviewLink, ReviewService } from '../services/review.service';
import { Title } from '@angular/platform-browser';

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
export class ReviewPage implements OnInit {
  readonly stars = [1, 2, 3, 4, 5];
  readonly maxComment = 1000;
  readonly maxName = 60;

  link: ReviewLink | null = null;
  loading = true;
  notFound = false;
  loadError = '';

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

  constructor(
    private readonly route: ActivatedRoute,
    private readonly reviews: ReviewService,
    private readonly title: Title,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.slug = (this.route.snapshot.paramMap.get('slug') || '').trim().toLowerCase();
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.notFound = false;
    this.reviews.getLink(this.slug).subscribe({
      next: (link) => {
        this.link = link;
        this.loading = false;
        this.title.setTitle(`Review ${link.agentName} | Velven`);
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.status === 404 || error.status === 400) this.notFound = true;
        else this.loadError = 'We could not load this review page. Check your connection and try again.';
        this.cdr.detectChanges();
      },
    });
  }

  /** Stars shown as filled: the hovered one while previewing, otherwise the chosen one. */
  get shownRating(): number {
    return this.hover || this.rating;
  }

  get ratingLabel(): string {
    return RATING_LABELS[this.shownRating] || 'Tap a star to rate';
  }

  get firstName(): string {
    return (this.link?.agentName || '').split(' ')[0] || 'your agent';
  }

  select(star: number): void {
    this.rating = star;
    this.ratingMissing = false;
    this.submitError = '';
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
          this.submitError =
            error.status === 429
              ? error.error?.message || 'Too many reviews from this connection. Please try again later.'
              : error.status === 0
                ? 'No connection. Check your internet and try again.'
                : error.error?.message || 'Your review could not be sent. Please try again.';
          this.cdr.detectChanges();
        },
      });
  }
}
