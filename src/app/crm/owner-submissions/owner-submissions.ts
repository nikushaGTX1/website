import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ListingInterestService } from '../../services/listing-interest.service';
import {
  OwnerListingService,
  OwnerSubmission,
  OwnerSubmissionStatus,
} from '../../services/owner-listing.service';
import { CrmService } from '../../services/crm.service';
import { CrmLead } from '../../models/crm';

type ReviewFilter = 'review' | 'ready' | 'progress' | 'history';
@Component({
  selector: 'app-owner-submissions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './owner-submissions.html',
  styleUrl: './owner-submissions.css',
})
export class OwnerSubmissions implements OnInit {
  private destroyRef = inject(DestroyRef);
  readonly checks = [
    { key: 'reviewAvailability', label: 'Availability and price confirmed' },
    { key: 'reviewDetails', label: 'Property details and photos checked' },
    { key: 'reviewTerms', label: 'Pets and lease terms confirmed' },
    { key: 'reviewOwnerApproval', label: 'Owner approval to publish confirmed' },
  ];
  submissions: OwnerSubmission[] = [];
  selectedId: number | null = null;
  loading = true;
  saving = false;
  error = '';
  success = '';
  search = '';
  filter: ReviewFilter = 'review';
  leads: CrmLead[] = [];
  clientsLoading = true;
  clientsError = false;
  verification: Record<string, boolean> = {};
  notes = '';
  photoIndex = 0;
  @ViewChild('photoDialog') photoDialog?: ElementRef<HTMLDialogElement>;
  openGallery(index: number): void {
    this.photoIndex = index;
    this.photoDialog?.nativeElement.showModal();
  }
  dirty = false;
  constructor(
    private service: OwnerListingService,
    private crm: CrmService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private interests: ListingInterestService,
  ) {}
  ngOnInit(): void {
    this.selectedId = Number(this.route.snapshot.queryParamMap.get('submission')) || null;
    this.load();
    this.crm
      .getLeads()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (leads) => {
          this.leads = leads;
          this.clientsLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.clientsLoading = false;
          this.clientsError = true;
          this.cdr.markForCheck();
        },
      });
  }
  load(): void {
    if (this.dirty && !confirm('Discard unsaved review changes?')) return;
    this.loading = true;
    this.error = '';
    this.service
      .getSubmissions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.submissions = rows;
          this.loading = false;
          this.restoreSelection();
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.error = e.error?.message || 'Could not load owner submissions.';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }
  get selected(): OwnerSubmission | undefined {
    return this.submissions.find((item) => item.id === this.selectedId);
  }
  isReady(item: OwnerSubmission): boolean {
    if (item.status === 'approved') return true;
    return this.checks.every((check) => item.verification?.[check.key]);
  }
  matchesFilter(item: OwnerSubmission, filter: ReviewFilter): boolean {
    if (filter === 'history') return ['published', 'sent', 'rejected'].includes(item.status);
    if (['published', 'sent', 'rejected'].includes(item.status)) return false;
    if (filter === 'ready') return this.isReady(item);
    if (filter === 'progress') return item.status !== 'new' && !this.isReady(item);
    return item.status === 'new' && !this.isReady(item);
  }
  count(filter: ReviewFilter): number {
    return this.submissions.filter((item) => this.matchesFilter(item, filter)).length;
  }
  get visible(): OwnerSubmission[] {
    const q = this.search.trim().toLowerCase();
    return this.submissions.filter(
      (item) =>
        this.matchesFilter(item, this.filter) &&
        (!q ||
          [item.ownerName, item.ownerPhone, this.title(item), this.address(item)].some((value) =>
            value.toLowerCase().includes(q),
          )),
    );
  }
  setFilter(filter: ReviewFilter): void {
    if (!this.discardChanges()) return;
    this.filter = filter;
    this.restoreSelection();
  }
  searchChanged(): void {
    if (!this.dirty) this.restoreSelection();
  }
  private discardChanges(): boolean {
    return !this.dirty || confirm('Discard unsaved review changes?');
  }
  select(item: OwnerSubmission): void {
    if (item.id === this.selectedId || !this.discardChanges()) return;
    this.setSelected(item);
  }
  private restoreSelection(): void {
    this.setSelected(this.visible.find((item) => item.id === this.selectedId) || this.visible[0]);
  }
  private setSelected(item?: OwnerSubmission): void {
    this.error = '';
    this.success = '';
    this.selectedId = item?.id ?? null;
    this.verification = { ...item?.verification };
    this.notes = item?.agentNotes || '';
    this.photoIndex = 0;
    this.dirty = false;
    this.photoDialog?.nativeElement.close();
    if (item?.isGeneralSubmission) this.interests.markRead(item.id, 'owner-submission').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }
  get completedChecks(): number {
    return this.checks.filter((check) => this.verification[check.key]).length;
  }
  get archived(): boolean {
    return !!this.selected && ['published', 'sent', 'rejected'].includes(this.selected.status);
  }
  save(status?: OwnerSubmissionStatus): void {
    const item = this.selected;
    if (!item || this.saving) return;
    if (status === 'rejected' && !confirm('Decline this owner submission?')) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.service
      .updateSubmission(item.id, {
        verification: { ...this.verification },
        agentNotes: this.notes,
        ...(status ? { status } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.submissions = this.submissions.map((row) => (row.id === updated.id ? updated : row));
          this.saving = false;
          this.dirty = false;
          this.success = status === 'rejected' ? 'Submission declined.' : 'Review saved.';
          if (!this.matchesFilter(updated, this.filter))
            this.filter =
              updated.status === 'rejected'
                ? 'history'
                : this.isReady(updated)
                  ? 'ready'
                  : updated.status === 'new'
                    ? 'review'
                    : 'progress';
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.saving = false;
          this.error =
            e.error?.message || 'Could not save the review. Your changes are still here.';
          this.cdr.markForCheck();
        },
      });
  }
  open(item: OwnerSubmission): void {
    if (!this.discardChanges()) return;
    if (item.isGeneralSubmission) {
      if (item.status === 'sent') this.router.navigate(['/apartments', item.publishedApartmentId]);
      else this.router.navigate(['/crm/owner-submissions', item.id, 'edit']);
      return;
    }
    if (item.status === 'published' && item.publishedApartmentId)
      this.router.navigate(['/apartments', item.publishedApartmentId]);
    else this.router.navigate(['/upload-apartment'], { queryParams: { owner: item.id } });
  }
  title(item: OwnerSubmission): string {
    const d = item.data || {};
    if (item.isGeneralSubmission) return `${item.dealType === 'Rent' ? 'ქირავდება' : 'იყიდება'} ${d['bedrooms'] ?? 0}-საძინებლიანი ${d['realEstateType'] === 'Apartment' ? 'ბინა' : 'სახლი'} — ${d['location'] || ''}`;
    return (
      d['title'] ||
      [
        d['bedrooms'] != null ? d['bedrooms'] + '-bedroom' : '',
        (d['realEstateType'] || 'Property').toLowerCase(),
        d['location'] ? 'in ' + d['location'] : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
  }
  price(item: OwnerSubmission): string {
    const d = item.data || {};
    const value = Number(d['totalPrice']);
    if (!value) return 'Price not provided';
    const symbol = ['GEL', '\u20be'].includes(d['currency'])
      ? '\u20be'
      : ['EUR', '\u20ac'].includes(d['currency'])
        ? '\u20ac'
        : String.fromCharCode(36);
    return symbol + value.toLocaleString('en-US') + (item.dealType === 'Rent' ? item.isGeneralSubmission ? ' / თვეში' : ' / month' : '');
  }
  address(item: OwnerSubmission): string {
    const d = item.data || {};
    return (
      [[d['street'], d['streetNumber']].filter(Boolean).join(' '), d['location']]
        .filter(Boolean)
        .join(', ') || 'Address not provided'
    );
  }
  statusLabel(item: OwnerSubmission): string {
    if (item.status === 'approved') return 'დამტკიცებულია';
    if (item.status === 'sent') return 'გაგზავნილია';
    if (['published', 'rejected'].includes(item.status))
      return item.status === 'published' ? 'Published' : 'Declined';
    return this.isReady(item) ? 'Ready' : item.status === 'new' ? 'Needs review' : 'In progress';
  }
  act(action: 'approve' | 'reject' | 'send'): void {
    const item = this.selected;
    if (!item || this.saving || this.dirty) return;
    this.saving = true; this.error = ''; this.success = '';
    this.service.review(item.id, action).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.service.getSubmission(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: updated => {
            this.submissions = this.submissions.map(row => row.id === updated.id ? updated : row);
            this.filter = updated.status === 'sent' || updated.status === 'rejected' ? 'history' : 'ready';
            this.saving = false;
            this.success = action === 'send' ? result.matchedClients ? `ბინა გაეგზავნა ${result.matchedClients} შესაბამის კლიენტს.` : 'შესაბამისი კლიენტები ამ ეტაპზე არ მოიძებნა. გაგზავნა შენახულია ისტორიაში.'
              : action === 'approve' ? 'ბინა დამტკიცებულია. გასავრცელებლად დააჭირეთ SEND-ს.' : 'განაცხადი უარყოფილია.';
            this.cdr.markForCheck();
          }, error: () => { this.saving = false; this.error = 'მონაცემები ვერ განახლდა. განაახლეთ სია.'; this.cdr.markForCheck(); },
        });
      }, error: e => { this.saving = false; this.error = e.error?.message || 'მოქმედება ვერ შესრულდა.'; this.cdr.markForCheck(); },
    });
  }
  eventLabel(action: string): string {
    return ({ submitted: 'განაცხადი მიღებულია', edited: 'მონაცემები შესწორებულია', contacted: 'მესაკუთრესთან დაკავშირება', visited: 'შემოწმება დასრულებულია', reviewed: 'შემოწმება შენახულია', approved: 'დამტკიცებულია', rejected: 'უარყოფილია', sent: 'გავრცელებულია' } as Record<string, string>)[action] || action;
  }
  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  phoneHref(phone: string): string {
    return 'tel:' + phone.replace(/[^+0-9]/g, '');
  }
  get matchingClients(): CrmLead[] {
    const item = this.selected;
    if (!item) return [];
    const d = item.data || {},
      price = Number(d['totalPrice']),
      district = String(d['location'] || '')
        .trim()
        .toLowerCase();
    if (!price || !district) return [];
    const currency = ['GEL', '\u20be'].includes(d['currency'])
      ? 'GEL'
      : ['EUR', '\u20ac'].includes(d['currency'])
        ? 'EUR'
        : 'USD';
    return this.leads.filter(
      (lead) =>
        !['lost', 'won'].includes(lead.status) &&
        (lead.currency || 'USD') === currency &&
        lead.budgetMax != null &&
        price <= lead.budgetMax &&
        price >= (lead.budgetMin || 0) &&
        !!lead.preferredDistricts?.some((value) => value.trim().toLowerCase() === district) &&
        (lead.bedrooms == null || Number(d['bedrooms']) === lead.bedrooms) &&
        (lead.goal || '').toLowerCase() === (item.dealType === 'Rent' ? 'rent' : 'buy'),
    );
  }
  clientBudget(lead: CrmLead): string {
    return (
      (lead.currency || 'USD') +
      ' ' +
      (lead.budgetMin || 0).toLocaleString() +
      ' - ' +
      (lead.budgetMax || 0).toLocaleString()
    );
  }
}
