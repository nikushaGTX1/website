import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isValidPhone } from './utils/phone';
import { combineLatest, filter, forkJoin, of, startWith, switchMap, timer, catchError } from 'rxjs';
import { OwnerListingService } from './services/owner-listing.service';
import { ApartmentService } from './services/apartment.service';
import { AfterViewInit, Component, DestroyRef, HostListener, signal } from '@angular/core';

import { NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';

import { AuthService } from './services/auth.service';
import { TranslationService } from './services/translation.service';
import { SeoService } from './services/seo.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css',
})
export class App implements AfterViewInit {
  protected readonly title = signal('site');

  constructor(
    private translation: TranslationService,
    private seo: SeoService,
    readonly router: Router,
    readonly auth: AuthService,
    readonly ownerListings: OwnerListingService,
    private readonly apartments: ApartmentService,
    destroyRef: DestroyRef,
  ) {
    combineLatest([
      this.auth.currentUser$,
      this.router.events.pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
      ),
    ])
      .pipe(
        switchMap(() =>
          this.isCrmWorkspace
            ? timer(0, 60000).pipe(
                switchMap(() =>
                  forkJoin([
                    this.ownerListings.getSubmissions().pipe(catchError(() => of(null))),
                    // Managers: number of agents' listings waiting for approval (side menu badge).
                    this.auth.isCrmManager
                      ? this.apartments.getPendingApartments().pipe(catchError(() => of(null)))
                      : of(null),
                  ]),
                ),
              )
            : of(null),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((result) => {
        const pending = result?.[1];
        if (pending) this.pendingApprovals.set(pending.filter((item) => item.status === 'pending').length);
      });
    this.seo.start();
    this.watchForNewBuild();
    this.router.events.subscribe((event) => {
      // A newer version was deployed while this tab stayed open (phones keep tabs for days):
      // the next page change loads it fully instead of continuing with the old one.
      if (event instanceof NavigationStart && this.newBuildAvailable) {
        window.location.assign(event.url);
        return;
      }
      // A tab left open across a deploy asks for page files that no longer exist, so taps on
      // links silently fail. Load the target page fresh instead (at most once a minute, so a
      // real outage cannot cause a reload loop).
      if (!(event instanceof NavigationError)) return;
      const message = String((event.error as Error)?.message || event.error || '');
      if (
        !/dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically/i.test(
          message,
        )
      )
        return;
      const last = Number(sessionStorage.getItem('velven-stale-build-reload')) || 0;
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem('velven-stale-build-reload', String(Date.now()));
      window.location.assign(event.url);
    });
  }

  /** True once the server serves a different build than the one running in this tab. */
  private newBuildAvailable = false;
  private lastBuildCheck = 0;

  /**
   * Compares this tab's main-XXXX.js with the one the server sends now. Checked when the tab
   * comes back to the front, when the browser restores it from its back/forward cache, and
   * every 10 minutes while it is open.
   */
  private watchForNewBuild(): void {
    const running = document
      .querySelector<HTMLScriptElement>('script[src*="main-"]')
      ?.getAttribute('src')
      ?.match(/main-[A-Z0-9]+\.js/i)?.[0];
    if (!running) return; // Development build: no hashed file names.
    const check = (): void => {
      if (this.newBuildAvailable || document.visibilityState !== 'visible') return;
      if (Date.now() - this.lastBuildCheck < 60_000) return;
      this.lastBuildCheck = Date.now();
      fetch('/main', { cache: 'no-store', credentials: 'same-origin' })
        .then((response) => (response.ok ? response.text() : ''))
        .then((html) => {
          const served = html.match(/main-[A-Z0-9]+\.js/i)?.[0];
          if (served && served !== running) this.newBuildAvailable = true;
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        this.lastBuildCheck = 0;
        check();
      }
    });
    window.setInterval(check, 10 * 60_000);
  }

  ngAfterViewInit(): void {
    this.translation.start();
  }

  // ---------- Phone numbers, on every form of the site ----------

  /** Letters and other symbols never get into a phone field (digits, +, spaces, -, brackets only). */
  @HostListener('document:input', ['$event'])
  cleanPhoneInput(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'tel' || (event as { phoneCleaned?: boolean }).phoneCleaned) return;
    let cleaned = input.value.replace(/[^\d+\s()-]/g, '').replace(/(?!^)\+/g, '');
    // Georgian numbers: +995 5XX XX XX XX is 12 digits, so nothing longer is accepted.
    const maxDigits = 12;
    let digits = 0;
    cleaned = [...cleaned].filter((char) => !/\d/.test(char) || ++digits <= maxDigits).join('');
    if (cleaned !== input.value) {
      input.value = cleaned;
      // Tell Angular forms about the cleaned value.
      const again = Object.assign(new Event('input', { bubbles: true }), { phoneCleaned: true });
      input.dispatchEvent(again);
    }
    if (input.classList.contains('phone-invalid')) this.markPhone(input);
  }

  /** Georgian numbers only: an empty phone field starts with "+995 " so only the number is typed. */
  @HostListener('document:focusin', ['$event'])
  prefillPhoneCode(event: FocusEvent): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'tel' || input.hasAttribute('data-phone-country')) return;
    if (input.value.trim() !== '' || input.readOnly || input.disabled) return;
    this.setPhoneValue(input, '+995 ');
  }

  /** After leaving a phone field: a red hint when the number is not a real phone number. */
  @HostListener('document:focusout', ['$event'])
  checkPhoneInput(event: FocusEvent): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'tel') return;
    // Only the prefilled code was left: treat the field as empty again.
    if (!input.hasAttribute('data-phone-country') && /^\+?995\s*$/.test(input.value.trim())) this.setPhoneValue(input, '');
    this.markPhone(input);
  }

  private setPhoneValue(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(Object.assign(new Event('input', { bubbles: true }), { phoneCleaned: true }));
  }

  private markPhone(input: HTMLInputElement): void {
    // Fields with their own country picker check the number for that country themselves.
    if (input.hasAttribute('data-phone-country')) return;
    const value = input.value.trim();
    const invalid = value !== '' && !isValidPhone(value);
    input.classList.toggle('phone-invalid', invalid);
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    // The hint must sit right under this field. Inside a grid (two fields side by side) a loose
    // element would take the next grid cell, so the field is wrapped together with its hint.
    let anchor: Element = input.closest('.input-icon, .editor-input') ?? input;
    if (invalid && anchor === input && !input.parentElement?.classList.contains('phone-field')) {
      const wrapper = document.createElement('span');
      wrapper.className = 'phone-field';
      input.insertAdjacentElement('beforebegin', wrapper);
      wrapper.appendChild(input);
    }
    if (anchor === input && input.parentElement?.classList.contains('phone-field')) anchor = input.parentElement;
    const hint = anchor === input.parentElement && anchor.classList.contains('phone-field')
      ? anchor.querySelector(':scope > .phone-hint')
      : (anchor.nextElementSibling?.classList.contains('phone-hint') ? anchor.nextElementSibling : null);
    if (invalid && !hint) {
      const element = document.createElement('small');
      element.className = 'phone-hint';
      element.setAttribute('role', 'alert');
      element.textContent = 'Enter a valid phone number, e.g. 555 12 34 56';
      if (anchor.classList.contains('phone-field')) anchor.appendChild(element);
      else anchor.insertAdjacentElement('afterend', element);
    } else if (!invalid && hint) {
      hint.remove();
    }
  }

  @HostListener('document:contextmenu', ['$event'])
  preventProtectedImageMenu(event: MouseEvent): void {
    const target = event.target as Element | null;

    if (target?.closest('[data-protected-image], [data-protected-photo]')) {
      event.preventDefault();
    }
  }

  @HostListener('document:dragstart', ['$event'])
  preventProtectedImageDrag(event: DragEvent): void {
    const target = event.target as Element | null;

    if (target?.closest('[data-protected-image], [data-protected-photo]')) {
      event.preventDefault();
    }
  }

  get isRegistrationPage(): boolean {
    return this.router.url.split(/[?#]/, 1)[0].toLowerCase() === '/register';
  }

  get isExploreProperty(): boolean {
    return this.router.url.split(/[?#]/, 1)[0].toLowerCase() === '/exploreproperty';
  }

  workspaceMenuOpen = false;
  /** Agents' listings waiting for a manager's approval. */
  readonly pendingApprovals = signal(0);
  /**
   * Closes the phone side menu. Returns nothing on purpose: a click handler that returns false
   * cancels the click in Angular, which blocked plain links in the menu (Open Live).
   */
  closeWorkspaceMenu(): void {
    this.workspaceMenuOpen = false;
  }
  get isCrmWorkspace(): boolean {
    const path = this.router.url.split(/[?#]/, 1)[0];
    return this.auth.canOpenCrm && /^\/crm(?:\/|$)/.test(path);
  }
  /** Name of the CRM page that is open, shown on the phone menu button. */
  get workspaceSectionLabel(): string {
    const section = this.router.url.split(/[?#]/, 1)[0].split('/')[2] || '';
    const labels: Record<string, string> = {
      '': 'Overview',
      listings: 'My listings',
      'owner-submissions': 'Owner submissions',
      'interested-clients': 'Interested clients',
      'submission-matches': 'შესაბამისი ბინები',
      'photo-cleaner': 'Watermark remover',
      approvals: 'Listing approvals',
      coupons: 'Coupons',
      system: 'System dashboard',
      viewings: 'Viewings',
      reviews: 'Reviews',
    };
    return labels[section] ?? section.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
  }
  get workspaceName(): string {
    return this.auth.currentUser?.fullName || this.auth.currentUser?.userName || 'Your workspace';
  }
  logoutWorkspace(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
  get showNavigation(): boolean {
    if (this.isCrmWorkspace) return false;
    const path = this.router.url.split(/[?#]/, 1)[0];
    const knownSingleSegmentPages = new Set([
      'main',
      'ExploreProperty',
      'property',
      'find-my-home',
      'ai-home-match',
      'about',
      'services',
      'apartment-detail',
      'agent-profile',
      'login',
      'blog',
      'upload-apartment',
      'admin',
      'crm',
      'my-profile',
      'my-listings',
      'saved-listings',
      'premium',
      'balance',
      'payment-methods',
      'my-business',
      'register',
      'discover',
      'clients',
      'careers',
      'play',
      'my-coupons',
      'my-viewings',
      'my-reviews',
      'interested-clients',
    ]);
    const segments = path.split('/').filter(Boolean);
    const isShortQuestionnaireUrl =
      segments.length === 1 && !knownSingleSegmentPages.has(segments[0]);

    return (
      !path.startsWith('/crm-questioner') &&
      !path.startsWith('/questions/') &&
      !isShortQuestionnaireUrl
    );
  }
}
