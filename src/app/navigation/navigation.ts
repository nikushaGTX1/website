import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { claimEscape, escapeAlreadyHandled } from '../utils/escape-layer';
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
  menuOpen = false;
  languageOpen = false;
  private subscription?: Subscription;

  constructor(
    private authService: AuthService,
    readonly translation: TranslationService,
    private host: ElementRef<HTMLElement>,
  ) {}

  /** Any press outside the language picker (profile menu, page, other buttons) closes the list. */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: Event): void {
    if (!this.languageOpen) return;
    const picker = this.host.nativeElement.querySelector('.language-picker');
    if (picker && event.target instanceof Node && picker.contains(event.target)) return;
    this.languageOpen = false;
  }

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
    this.isLoggedIn = this.authService.isLoggedIn;
    this.canOpenAdmin = this.authService.isAgent || this.authService.isCrmManager;
    this.subscription = this.authService.currentUser$.subscribe(() => {
      this.isLoggedIn = this.authService.isLoggedIn;
      this.canOpenAdmin = this.authService.isAgent || this.authService.isCrmManager;
    });
  }

  ngOnDestroy(): void {
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
