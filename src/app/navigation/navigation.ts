import { Component, OnDestroy, OnInit } from '@angular/core';
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
  ) {}

  ngOnInit(): void {
    this.isLoggedIn = this.authService.isLoggedIn;
    this.canOpenAdmin = this.authService.isAgent;
    this.subscription = this.authService.currentUser$.subscribe(() => {
      this.isLoggedIn = this.authService.isLoggedIn;
      this.canOpenAdmin = this.authService.isAgent;
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
