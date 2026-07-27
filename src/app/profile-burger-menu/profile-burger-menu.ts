import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';

interface MenuItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-profile-burger-menu',
  standalone: false,
  templateUrl: './profile-burger-menu.html',
  styleUrl: './profile-burger-menu.css',
})
export class ProfileBurgerMenu implements OnInit, OnDestroy {
  isOpen = false;
  user: User | null = null;

  menuItems: MenuItem[] = [
    { label: 'My Profile', route: '/my-profile', icon: 'fa-regular fa-user' },
    { label: 'My listings', route: '/my-listings', icon: 'fa-solid fa-list' },
    { label: 'Saved listings', route: '/saved-listings', icon: 'fa-regular fa-heart' },
    { label: 'Premium', route: '/premium', icon: 'fa-solid fa-crown' },
    { label: 'Balance', route: '/balance', icon: 'fa-solid fa-wallet' },
    { label: 'Payment methods', route: '/payment-methods', icon: 'fa-regular fa-credit-card' },
    { label: 'My business', route: '/my-business', icon: 'fa-solid fa-briefcase' },
  ];

  private subscription?: Subscription;

  constructor(
    private elementRef: ElementRef,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subscription = this.authService.currentUser$.subscribe((user) => {
      this.user = user;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  toggleMenu(): void {
    this.isOpen = !this.isOpen;
  }

  closeMenu(): void {
    this.isOpen = false;
  }

  logout(): void {
    this.closeMenu();
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  get userPinLabel(): string {
    if (this.user?.pin) {
      return `PIN: ${this.user.pin}`;
    }

    return this.user?.email || '';
  }

  get profileImage(): string {
    return toMediaUrl(this.user?.profilePictureUrl || this.user?.profilePicture);
  }

  fixProfileImage(event: Event): void {
    tryNextProfileImageUrl(event);
  }
}
