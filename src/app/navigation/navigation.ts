import { Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { claimEscape, escapeAlreadyHandled } from '../utils/escape-layer';
import { lockPageScroll, unlockPageScroll } from '../utils/page-scroll-lock';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import {
  AppLanguage,
  TranslationService,
} from '../services/translation.service';

@Component({
  selector: 'app-navigation',
  standalone: false,
  templateUrl: './navigation.html',
  styleUrl: './navigation.css',
})
export class Navigation implements OnInit, OnDestroy {
  isLoggedIn = false;
  canOpenAdmin = false;
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
  private subscription?: Subscription;

  constructor(
    private authService: AuthService,
    readonly translation: TranslationService,
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
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
    this.canOpenAdmin = this.authService.isAgent || this.authService.isCrmManager;
    this.subscription = this.authService.currentUser$.subscribe(() => {
      this.isLoggedIn = this.authService.isLoggedIn;
      this.canOpenAdmin = this.authService.isAgent || this.authService.isCrmManager;
    });
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
}
