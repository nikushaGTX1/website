import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CouponService, StaffCoupon, StaffCouponPage } from '../../services/coupon.service';

type StatusFilter = '' | 'active' | 'redeemed' | 'void';

/**
 * CRM (managers and admins): check a coupon code a client shows, use it on a deal (once only),
 * cancel a suspicious one, and see every coupon with who used or cancelled it.
 */
@Component({
  selector: 'app-crm-coupons',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './coupons.html',
  styleUrl: './coupons.css',
})
export class CrmCoupons implements OnInit {
  // Code check
  code = '';
  checking = false;
  checked: StaffCoupon | null = null;
  checkError = '';
  note = '';
  reason = '';
  confirming: 'redeem' | 'void' | null = null;
  acting = false;
  actionError = '';

  // All coupons
  search = '';
  status: StatusFilter = '';
  page = 1;
  list: StaffCouponPage | null = null;
  listLoading = true;
  listError = false;
  private searchTimer?: number;

  readonly tabs: Array<{ value: StatusFilter; label: string }> = [
    { value: '', label: 'All' },
    { value: 'active', label: 'Ready to use' },
    { value: 'redeemed', label: 'Used' },
    { value: 'void', label: 'Cancelled' },
  ];

  constructor(
    private coupons: CouponService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  check(): void {
    const code = this.code.trim();
    if (!code || this.checking) return;
    this.checking = true;
    this.checkError = '';
    this.checked = null;
    this.confirming = null;
    this.actionError = '';
    this.coupons.lookup(code).subscribe({
      next: (result) => {
        this.checked = result;
        this.checking = false;
        this.note = '';
        this.reason = '';
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.checking = false;
        this.checkError =
          error?.status === 404 ? 'No coupon with this code. Check the letters and try again.' : 'The code could not be checked. Try again.';
        this.cdr.markForCheck();
      },
    });
  }

  open(item: StaffCoupon): void {
    this.code = item.coupon.code;
    this.checked = item;
    this.checkError = '';
    this.confirming = null;
    this.actionError = '';
    this.note = '';
    this.reason = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Using or cancelling asks for a second click, since neither can be undone. */
  confirm(action: 'redeem' | 'void'): void {
    this.confirming = action;
    this.actionError = '';
  }

  act(): void {
    if (!this.checked || !this.confirming || this.acting) return;
    const id = this.checked.coupon.id;
    const request =
      this.confirming === 'redeem' ? this.coupons.redeem(id, this.note) : this.coupons.cancel(id, this.reason);
    this.acting = true;
    request.subscribe({
      next: (result) => {
        this.checked = result;
        this.acting = false;
        this.confirming = null;
        this.load();
      },
      error: (error) => {
        this.acting = false;
        this.confirming = null;
        // Someone else used or cancelled it in the meantime: show its real state.
        this.actionError = error?.error?.message || 'The coupon could not be updated. Try again.';
        if (error?.status === 409) this.coupons.lookup(this.checked!.coupon.code).subscribe((fresh) => (this.checked = fresh));
        this.cdr.markForCheck();
      },
    });
  }

  load(page = this.page): void {
    this.page = page;
    this.listLoading = true;
    this.listError = false;
    this.coupons.listAll(this.search.trim(), this.status, page).subscribe({
      next: (result) => {
        this.list = result;
        this.listLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.listLoading = false;
        this.listError = true;
        this.cdr.markForCheck();
      },
    });
  }

  setStatus(status: StatusFilter): void {
    this.status = status;
    this.load(1);
  }

  onSearch(value: string): void {
    this.search = value;
    window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => this.load(1), 300);
  }

  count(status: StatusFilter): number | null {
    const counts = this.list?.counts;
    if (!counts) return null;
    if (status === 'active') return counts.active;
    if (status === 'redeemed') return counts.redeemed;
    if (status === 'void') return counts.void;
    return counts.active + counts.redeemed + counts.void;
  }

  get pages(): number {
    return this.list ? Math.max(1, Math.ceil(this.list.total / this.list.pageSize)) : 1;
  }

  statusLabel(status: string): string {
    return status === 'active' ? 'Ready to use' : status === 'redeemed' ? 'Used' : 'Cancelled';
  }
}
