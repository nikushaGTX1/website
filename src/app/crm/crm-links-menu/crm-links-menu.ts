import { ChangeDetectorRef, Component, ElementRef, HostListener } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { OwnerListingService } from '../../services/owner-listing.service';
import { ReviewService, reviewLinkUrl } from '../../services/review.service';
import { claimEscape, escapeAlreadyHandled } from '../../utils/escape-layer';

type LinkKind = 'owner-rent' | 'owner-sale' | 'review' | 'intake';

interface LinkAction {
  kind: LinkKind;
  icon: string;
  title: string;
  hint: string;
  /** Copies a fresh link; intake opens its card on the CRM overview instead. */
  opens?: boolean;
}

/**
 * CRM side menu "Links": one button that opens the shareable links (owner
 * Rent/Sale, review, client intake). Each one is created and copied in one click.
 */
@Component({
  selector: 'app-crm-links-menu',
  imports: [NgIf, NgFor],
  templateUrl: './crm-links-menu.html',
  styleUrl: './crm-links-menu.css',
})
export class CrmLinksMenu {
  open = false;
  busy: LinkKind | null = null;
  copied: LinkKind | null = null;
  /** Shown when the browser refuses clipboard access, so the link can be copied by hand. */
  manualUrl = '';
  error = '';

  constructor(
    private auth: AuthService,
    private ownerListings: OwnerListingService,
    private reviews: ReviewService,
    private router: Router,
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef,
  ) {}

  get actions(): LinkAction[] {
    const list: LinkAction[] = [
      { kind: 'owner-rent', icon: 'fa-solid fa-key', title: 'Owner link · Rent', hint: 'Owner submits an apartment for rent' },
      { kind: 'owner-sale', icon: 'fa-solid fa-tag', title: 'Owner link · Sale', hint: 'Owner submits an apartment for sale' },
    ];
    if (this.auth.isAgent || this.auth.isCrmManager) {
      list.push({ kind: 'review', icon: 'fa-regular fa-star', title: 'Review link', hint: 'Clients rate their experience with you' });
      list.push({ kind: 'intake', icon: 'fa-solid fa-user-plus', title: 'Client intake link', hint: 'Create or share the intake form', opens: true });
    }
    return list;
  }

  /** The list is rebuilt on every check; keeping each button stops clicks being lost. */
  trackKind(_index: number, action: LinkAction): LinkKind {
    return action.kind;
  }

  toggle(event: Event): void {
    // The side menu closes itself on any click inside it (mobile); keep it open for this button.
    event.stopPropagation();
    this.open = !this.open;
    this.error = '';
    this.manualUrl = '';
  }

  async run(action: LinkAction, event: Event): Promise<void> {
    if (this.busy) return;
    this.error = '';
    this.manualUrl = '';
    if (action.opens) {
      // Opening a page: let the click reach the side menu so it closes on phones.
      this.open = false;
      void this.router.navigate(['/crm'], { queryParams: { tool: 'intake' } });
      return;
    }
    // Copying a link: keep the side menu (and this panel) open to show "Copied".
    event.stopPropagation();
    this.busy = action.kind;
    this.cdr.markForCheck();
    try {
      const url = await this.createUrl(action.kind);
      try {
        await navigator.clipboard.writeText(url);
        this.copied = action.kind;
        setTimeout(() => {
          if (this.copied === action.kind) this.copied = null;
          this.cdr.markForCheck();
        }, 2500);
      } catch {
        this.manualUrl = url;
      }
    } catch (error: any) {
      this.error = error?.error?.message || 'Could not create the link. Please try again.';
    } finally {
      this.busy = null;
      this.cdr.markForCheck();
    }
  }

  private async createUrl(kind: LinkKind): Promise<string> {
    const origin = window.location.origin;
    if (kind === 'owner-rent' || kind === 'owner-sale') {
      const response = await firstValueFrom(this.ownerListings.createLink(kind === 'owner-rent' ? 'Rent' : 'Sale'));
      return new URL(response.path, origin).toString();
    }
    const dashboard = await firstValueFrom(this.reviews.getMine(null, 'newest'));
    return reviewLinkUrl(dashboard.slug);
  }

  selectManual(input: HTMLInputElement): void {
    input.select();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.open = false;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.open || escapeAlreadyHandled(event)) return;
    claimEscape(event);
    this.open = false;
  }
}
