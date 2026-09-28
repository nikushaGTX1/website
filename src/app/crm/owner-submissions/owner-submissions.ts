import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { OwnerListingService, OwnerSubmission, OwnerSubmissionStatus } from '../../services/owner-listing.service';

@Component({ selector: 'app-owner-submissions', standalone: true, imports: [CommonModule, FormsModule, RouterModule], templateUrl: './owner-submissions.html', styleUrl: './owner-submissions.css' })
export class OwnerSubmissions implements OnInit {
  readonly statuses: Array<{ value: OwnerSubmissionStatus; label: string }> = [
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Called' },
    { value: 'visited', label: 'Visited' },
    { value: 'published', label: 'Published' },
    { value: 'rejected', label: 'Rejected' },
  ];

  submissions: OwnerSubmission[] = []; loading = true; error = '';
  filter: OwnerSubmissionStatus | 'all' = 'all'; search = '';

  constructor(private service: OwnerListingService, private router: Router) {}
  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true; this.error = '';
    this.service.getSubmissions().subscribe({
      next: rows => { this.submissions = rows; this.loading = false; },
      error: e => { this.error = e.error?.message || 'Could not load owner submissions.'; this.loading = false; },
    });
  }

  get visible(): OwnerSubmission[] {
    const q = this.search.trim().toLowerCase();
    return this.submissions.filter(item => (this.filter === 'all' || item.status === this.filter) &&
      (!q || [item.ownerName, item.ownerPhone, item.data?.['location'], item.data?.['street']].some(v => String(v || '').toLowerCase().includes(q))));
  }
  count(status: OwnerSubmissionStatus | 'all'): number { return status === 'all' ? this.submissions.length : this.submissions.filter(s => s.status === status).length; }
  statusLabel(status: OwnerSubmissionStatus): string { return this.statuses.find(s => s.value === status)?.label || status; }

  /** Verification happens in the regular listing form, pre-filled with the owner's answers. */
  open(item: OwnerSubmission): void {
    if (item.status === 'published' && item.publishedApartmentId) this.router.navigate(['/apartments', item.publishedApartmentId]);
    else this.router.navigate(['/upload-apartment'], { queryParams: { owner: item.id } });
  }

  price(item: OwnerSubmission): string {
    const value = Number(item.data?.['totalPrice']);
    if (!value) return '—';
    const symbol = item.data?.['currency'] === 'GEL' ? '₾' : '$';
    return `${symbol}${value.toLocaleString('en-US')}${item.dealType === 'Rent' ? '/mo' : ''}`;
  }
  address(item: OwnerSubmission): string {
    const d = item.data || {};
    return [[d['street'], d['streetNumber']].filter(Boolean).join(' '), d['location']].filter(Boolean).join(', ') || 'No address';
  }
}
