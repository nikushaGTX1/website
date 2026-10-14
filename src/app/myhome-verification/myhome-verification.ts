import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslationService } from '../services/translation.service';
import { toMediaUrl } from '../utils/api-media';
import { VerificationOverview, VerificationRow, verificationProgress } from './verification-model';
import { verificationTranslations } from './verification-translations';

@Component({
  selector: 'app-myhome-verification',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './myhome-verification.html',
  styleUrl: './myhome-verification.css',
})
export class MyHomeVerification implements OnInit, OnDestroy {
  overview: VerificationOverview = { job: null };
  rows: VerificationRow[] = [];
  readonly statuses = ['ALL', 'ACTIVE', 'REMOVED', 'UNCERTAIN', 'ERROR'];
  readonly metrics = [
    'Total apartments',
    'Listings checked',
    'Active listings',
    'Removed listings',
    'Uncertain listings',
    'Failed checks',
    'Missing MyHome IDs',
  ];
  filter = 'ALL';
  search = '';
  page = 1;
  total = 0;
  error = '';
  starting = false;
  loading = false;
  expanded = false;
  private timer?: ReturnType<typeof setTimeout>;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private requests = new Subscription();
  private resultRequest?: Subscription;
  private destroyed = false;
  private readonly api = '/api/MyHomeVerification';
  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private translation: TranslationService,
  ) {
    translation.registerTranslations(
      'ka',
      verificationTranslations.map(([source, ka]) => ({ source, translation: ka })),
    );
    translation.registerTranslations(
      'ru',
      verificationTranslations.map(([source, , ru]) => ({ source, translation: ru })),
    );
  }
  ngOnInit(): void {
    this.refresh();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
    clearTimeout(this.searchTimer);
    this.requests.unsubscribe();
    this.resultRequest?.unsubscribe();
  }
  get progress() {
    return verificationProgress(this.overview);
  }
  get running() {
    return this.overview.job?.state === 'RUNNING';
  }
  label(status: string): string {
    return (
      (
        {
          ALL: 'All listings',
          ACTIVE: 'Active',
          REMOVED: 'Removed',
          UNCERTAIN: 'Uncertain',
          ERROR: 'Errors',
          PENDING: 'Pending',
          NO_MYHOME_ID: 'Missing MyHome IDs',
        } as Record<string, string>
      )[status] || status
    );
  }
  metric(index: number): number {
    if (index === 0) return this.overview.job?.totalApartments ?? 0;
    if (index === 1) return this.progress.processed;
    if (index === 6) return this.overview.job?.missingIds ?? 0;
    return (
      this.overview.counts?.find(
        (c) => c.status === ['', '', 'ACTIVE', 'REMOVED', 'UNCERTAIN', 'ERROR'][index],
      )?.count ?? 0
    );
  }
  image(url?: string): string {
    return toMediaUrl(url) || '';
  }
  imageError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
  start(): void {
    if (this.starting || this.running) return;
    this.starting = true;
    this.error = '';
    this.expanded = true;
    this.page = 1;
    this.requests.add(
      this.http.post(this.api + '/jobs', {}).subscribe({
        next: () => {
          this.starting = false;
          this.refresh();
          this.cdr.markForCheck();
        },
        error: () => {
          this.starting = false;
          this.error = 'Could not start verification. Check your permissions and connection.';
          this.cdr.markForCheck();
        },
      }),
    );
  }
  refresh(): void {
    clearTimeout(this.timer);
    this.requests.add(
      this.http.get<VerificationOverview>(this.api + '/latest').subscribe({
        next: (data) => {
          this.overview = data;
          this.error = '';
          if (this.expanded) this.results();
          this.cdr.markForCheck();
          this.schedule();
        },
        error: () => {
          this.error = 'Could not load verification. Retrying automatically.';
          this.cdr.markForCheck();
          this.schedule();
        },
      }),
    );
  }
  private schedule(): void {
    if (!this.destroyed) this.timer = setTimeout(() => this.refresh(), this.running ? 3000 : 15000);
  }
  toggle(): void {
    this.expanded = !this.expanded;
    if (this.expanded) this.results();
  }
  select(status: string): void {
    this.filter = status;
    this.page = 1;
    this.expanded = true;
    this.results();
  }
  searchChanged(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 1;
      this.results();
    }, 300);
  }
  move(amount: number): void {
    this.page += amount;
    this.results();
  }
  results(): void {
    if (!this.overview.job) return;
    this.resultRequest?.unsubscribe();
    this.loading = true;
    const params = new HttpParams()
      .set('status', this.filter)
      .set('search', this.search)
      .set('page', this.page);
    this.resultRequest = this.http
      .get<{ items: VerificationRow[]; total: number }>(
        `${this.api}/jobs/${this.overview.job.id}/results`,
        { params },
      )
      .subscribe({
        next: (data) => {
          this.rows = data.items;
          this.total = data.total;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.error = 'Could not load results. Use Refresh to try again.';
          this.cdr.markForCheck();
        },
      });
  }
}
