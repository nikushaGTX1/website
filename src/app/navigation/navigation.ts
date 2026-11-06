import { Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { claimEscape, escapeAlreadyHandled } from '../utils/escape-layer';
import { lockPageScroll, unlockPageScroll } from '../utils/page-scroll-lock';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AppLanguage, TranslationService } from '../services/translation.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { ClientService } from '../services/client.service';
import { toMediaUrl } from '../utils/api-media';
import { enableFlagEmojis } from '../utils/flag-emoji';

enableFlagEmojis();
import { ProfileBurgerMenu } from '../profile-burger-menu/profile-burger-menu';
import { NotificationBell } from '../notification-bell/notification-bell';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.html',
  styleUrl: './navigation.css',
  imports: [RouterLink, RouterLinkActive, NgIf, NgFor, ProfileBurgerMenu, NotificationBell],
})
export class Navigation implements OnInit, OnDestroy {
  isLoggedIn = false;
  /** Bell: clients get match alerts, owners and agents get interested-client alerts. */
  showBell = false;
  private menuIsOpen = false;
  get menuOpen(): boolean {
    return this.menuIsOpen;
  }
  /** While the mobile menu is open only the menu scrolls, never the page behind it (VELVEN-023). */
  set menuOpen(open: boolean) {
    if (open === this.menuIsOpen) return;
    this.menuIsOpen = open;
    if (open) lockPageScroll();
    else unlockPageScroll();
  }
  languageOpen = false;
  /** Phone menu: the account tiles are shown open. */
  accountOpen = true;
  private newMatches = 0;
  readonly languageOptions: Array<{ code: AppLanguage; label: string; flag: string }> = [
    { code: 'ka', label: 'GE', flag: '🇬🇪' },
    { code: 'en', label: 'EN', flag: '🇬🇧' },
    { code: 'ru', label: 'RU', flag: '🇷🇺' },
  ];
  private subscription?: Subscription;

  get accountName(): string {
    return this.authService.currentUser?.fullName || 'My account';
  }

  get accountEmail(): string {
    return this.authService.currentUser?.email || '';
  }

  get profileImage(): string {
    const user = this.authService.currentUser;
    return toMediaUrl(user?.profilePictureUrl || user?.profilePicture);
  }

  /** Same account links as the desktop profile menu. */
  get accountItems(): Array<{ label: string; route: string; icon: string; badge?: number; featured?: boolean }> {
    const account = [
      { label: 'My Profile', route: '/my-profile', icon: 'fa-regular fa-user' },
      { label: 'My listings', route: '/my-listings', icon: 'fa-solid fa-house-user' },
      { label: 'Saved listings', route: '/saved-listings', icon: 'fa-regular fa-heart' },
      { label: 'My viewings', route: '/my-viewings', icon: 'fa-regular fa-calendar-check' },
      { label: 'My coupons', route: '/my-coupons', icon: 'fa-solid fa-ticket' },
    ];
    if (this.authService.isPersonalAccount)
      return [{ label: 'Velven Discover', route: '/discover', icon: 'fa-solid fa-wand-magic-sparkles', badge: this.newMatches, featured: true }, ...account];
    return this.authService.canOpenCrm
      ? [{ label: 'CRM workspace', route: '/crm', icon: 'fa-solid fa-chart-line', featured: true }, ...account]
      : account;
  }

  logout(): void {
    this.closeMenu();
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  constructor(
    private authService: AuthService,
    readonly translation: TranslationService,
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
    private router: Router,
    private clientService: ClientService,
  ) {}

  /**
   * Any press outside the language picker closes the list. Registered outside Angular:
   * a document-wide @HostListener re-rendered the whole page on every tap, and on phones
   * that mid-tap DOM churn made taps get swallowed instead of becoming clicks.
   */
  private readonly onDocumentPointerDown = (event: Event): void => {
    if (!this.languageOpen) return;
    const picker = this.host.nativeElement.querySelector('.language-picker');
    if (picker && event.target instanceof Node && picker.contains(event.target)) return;
    this.zone.run(() => (this.languageOpen = false));
  };

  /** Esc closes the language list first, then the menu, and returns focus to its toggle. */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (escapeAlreadyHandled(event)) return;
    if (this.languageOpen) {
      claimEscape(event);
      this.languageOpen = false;
      return;
    }
    if (this.menuOpen) {
      claimEscape(event);
      this.menuOpen = false;
      this.host.nativeElement.querySelector<HTMLElement>('.menu-toggle')?.focus();
    }
  }

  ngOnInit(): void {
    this.zone.runOutsideAngular(() =>
      document.addEventListener('pointerdown', this.onDocumentPointerDown, { passive: true }),
    );
    this.isLoggedIn = this.authService.isLoggedIn;
    this.showBell = this.authService.isLoggedIn;
    this.subscription = this.authService.currentUser$.subscribe(() => {
      this.isLoggedIn = this.authService.isLoggedIn;
      this.showBell = this.authService.isLoggedIn;
    });
    this.subscription.add(this.clientService.summary$.subscribe((summary) => (this.newMatches = summary.newMatches)));
  }

  ngOnDestroy(): void {
    this.menuOpen = false;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
    this.subscription?.unsubscribe();
  }

  closeMenu(): void {
    this.menuOpen = false;
    this.languageOpen = false;
  }

  selectLanguage(language: AppLanguage): void {
    this.translation.setLanguage(language);
    this.languageOpen = false;
  }

  trackLanguage = (_: number, option: { code: string }) => option.code;
}
