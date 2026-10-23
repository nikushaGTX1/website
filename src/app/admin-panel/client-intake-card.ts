import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
import { ClientBoardService, IntakeLink, IntakeSubmission } from '../services/client-board.service';

@Component({
  selector: 'app-client-intake-card',
  imports: [CommonModule, FormsModule],
  templateUrl: './client-intake-card.html',
  styleUrl: './client-intake-card.css',
})
export class ClientIntakeCard implements OnInit, OnDestroy {
  links: IntakeLink[] = [];
  submissions: IntakeSubmission[] = [];
  loading = false;
  busy = false;
  error = '';
  copied = 0;
  page = 1;
  total = 0;
  private subscriptions = new Subscription();
  constructor(
    private api: ClientBoardService,
    private cdr: ChangeDetectorRef,
  ) {}
  ngOnInit() {
    this.load();
  }
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
  url(link: IntakeLink) {
    return `${location.origin}/ai-home-match?intake=${encodeURIComponent(link.slug || link.token)}`;
  }
  share(link: IntakeLink, channel: 'whatsapp' | 'telegram') {
    const url = encodeURIComponent(this.url(link));
    return channel === 'whatsapp'
      ? `https://wa.me/?text=${url}`
      : `https://t.me/share/url?url=${url}`;
  }
  load(page = this.page) {
    this.loading = true;
    this.error = '';
    this.page = page;
    this.subscriptions.add(
      forkJoin({ links: this.api.links(), submissions: this.api.submissions(page) }).subscribe({
        next: ({ links, submissions }) => {
          this.links = links;
          this.submissions = submissions.items;
          this.total = submissions.total;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.error = 'Intake information could not be loaded. Please retry.';
          this.cdr.markForCheck();
        },
      }),
    );
  }
  create() {
    this.busy = true;
    this.error = '';
    this.subscriptions.add(
      this.api.createLink().subscribe({
        next: (link) => {
          this.links = [link, ...this.links];
          this.busy = false;
          this.cdr.markForCheck();
        },
        error: () => this.failed(),
      }),
    );
  }
  revoke(link: IntakeLink) {
    this.busy = true;
    this.error = '';
    this.subscriptions.add(
      this.api.revoke(link.id).subscribe({
        next: () => {
          link.isActive = false;
          this.busy = false;
          this.cdr.markForCheck();
        },
        error: () => this.failed(),
      }),
    );
  }
  setStatus(submission: IntakeSubmission, status: string) {
    const previousStatus = submission.status;
    submission.status = status;
    this.busy = true;
    this.error = '';
    this.subscriptions.add(
      this.api.status(submission.id, status).subscribe({
        next: () => {
          submission.status = status;
          this.busy = false;
          this.cdr.markForCheck();
        },
        error: () => {
          submission.status = previousStatus;
          this.failed();
        },
      }),
    );
  }
  private failed() {
    this.busy = false;
    this.error = 'The intake change could not be saved. Please retry.';
    this.cdr.markForCheck();
  }
  async copy(link: IntakeLink) {
    try {
      await navigator.clipboard.writeText(this.url(link));
      this.copied = link.id;
    } catch {
      this.error = 'Copy failed. Select and copy the URL.';
    }
    this.cdr.markForCheck();
  }
}
