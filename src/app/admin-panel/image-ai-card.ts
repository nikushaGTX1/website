import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, forkJoin, interval } from 'rxjs';
import {
  ImageAiJob,
  ImageAiService,
  ImageAiStatus,
  ImageAuthorizationBasis,
  ImageJobStatus,
} from '../services/image-ai.service';
import { TranslationService } from '../services/translation.service';
import { IMAGE_AI_COPY } from '../i18n/image-ai-translations';

// Admin review queue for watermark detection and authorized photo cleanup.
@Component({
  selector: 'app-image-ai-card',
  imports: [CommonModule, FormsModule],
  templateUrl: './image-ai-card.html',
  styleUrl: './image-ai-card.css',
})
export class ImageAiCard implements OnInit, OnDestroy {
  readonly filters: { value: ImageJobStatus | ''; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'AwaitingApproval', label: 'Awaiting approval' },
    { value: 'NeedsCleanOriginal', label: 'Needs clean original' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Failed', label: 'Failed' },
    { value: 'Approved', label: 'Approved' },
  ];

  status: ImageAiStatus | null = null;
  jobs: ImageAiJob[] = [];
  filter: ImageJobStatus | '' = '';
  page = 1;
  loading = false;
  busyId: number | null = null;
  error = '';
  notice = '';
  queuedCount = 0;

  apartmentId: number | null = null;
  mode: 'detect' | 'process' = 'detect';
  basis: ImageAuthorizationBasis = 'Unknown';
  permissionReference = '';
  submitting = false;

  private subscriptions = new Subscription();

  constructor(
    private api: ImageAiService,
    private cdr: ChangeDetectorRef,
    translation: TranslationService,
  ) {
    translation.registerTranslations(
      'ka',
      IMAGE_AI_COPY.map(([source, ka]) => ({ source, translation: ka })),
    );
    translation.registerTranslations(
      'ru',
      IMAGE_AI_COPY.map(([source, , ru]) => ({ source, translation: ru })),
    );
  }

  ngOnInit() {
    this.load();
    // Jobs finish in the background; refresh while any are still queued.
    this.subscriptions.add(
      interval(15000).subscribe(() => {
        if (this.hasOpenJobs && !this.loading) this.load(this.page, true);
      }),
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  get hasOpenJobs(): boolean {
    return !!(this.status?.counts.Pending || this.status?.counts.Running);
  }

  get canSubmit(): boolean {
    if (!this.apartmentId || this.apartmentId < 1 || this.submitting) return false;
    if (this.mode === 'process' && this.basis === 'Unknown') return false;
    return this.basis !== 'Licensed' || this.permissionReference.trim().length > 0;
  }

  count(status: ImageJobStatus): number {
    return this.status?.counts[status] ?? 0;
  }

  setFilter(value: ImageJobStatus | '') {
    this.filter = value;
    this.load(1);
  }

  load(page = this.page, silent = false) {
    this.loading = !silent;
    this.page = page;
    this.subscriptions.add(
      forkJoin({ status: this.api.status(), jobs: this.api.jobs(this.filter, page) }).subscribe({
        next: ({ status, jobs }) => {
          this.status = status;
          this.jobs = jobs;
          this.loading = false;
          if (!silent) this.error = '';
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.error = 'Photo AI information could not be loaded. Please retry.';
          this.cdr.markForCheck();
        },
      }),
    );
  }

  submit() {
    if (!this.canSubmit || !this.apartmentId) return;
    this.submitting = true;
    this.error = '';
    this.notice = '';
    this.subscriptions.add(
      this.api
        .enqueue({
          apartmentId: this.apartmentId,
          mode: this.mode,
          authorizationBasis: this.basis,
          permissionReference: this.permissionReference.trim() || undefined,
        })
        .subscribe({
          next: (result) => {
            this.submitting = false;
            this.queuedCount = result.queued;
            this.notice =
              result.queued > 0
                ? 'Photos queued.'
                : 'No new photos queued. They may already be in the queue.';
            this.load(1);
          },
          error: (error: HttpErrorResponse) => {
            this.submitting = false;
            this.error = error.error?.message || 'Photos could not be queued.';
            this.cdr.markForCheck();
          },
        }),
    );
  }

  run(job: ImageAiJob, action: 'approve' | 'reject' | 'revert' | 'retry' | 'clean-original-requested') {
    if (this.busyId) return;
    this.busyId = job.id;
    this.error = '';
    this.subscriptions.add(
      this.api.action(job.id, action).subscribe({
        next: () => {
          this.busyId = null;
          this.load(this.page, true);
        },
        error: (error: HttpErrorResponse) => {
          this.busyId = null;
          this.error = error.error?.message || 'The action could not be completed.';
          this.cdr.markForCheck();
        },
      }),
    );
  }

  statusLabel(status: ImageJobStatus): string {
    return (
      {
        Pending: 'Pending',
        Running: 'Running',
        NoWatermark: 'No watermark',
        NeedsCleanOriginal: 'Needs clean original',
        DetectedOnly: 'Watermark detected',
        AwaitingApproval: 'Awaiting approval',
        Approved: 'Approved',
        Rejected: 'Rejected',
        Failed: 'Failed',
      } as Record<ImageJobStatus, string>
    )[status];
  }
}
