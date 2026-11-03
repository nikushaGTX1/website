import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ClientService } from '../services/client.service';
import { User } from '../models/user';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';
import { NgIf, NgFor } from '@angular/common';
import { PhotoUrlPipe } from '../shared/photo-url.pipe';

interface MenuItem {
  label: string;
  route: string;
  icon: string;
  /** Count badge (Velven Discover: new matches). */
  badge?: number;
  featured?: boolean;
  /** Opens in a new tab (the live website from the CRM). */
  newTab?: boolean;
}

@Component({
  selector: 'app-profile-burger-menu',
  templateUrl: './profile-burger-menu.html',
  styleUrl: './profile-burger-menu.css',
  imports: [PhotoUrlPipe, NgIf, NgFor, RouterLink],
})
export class ProfileBurgerMenu implements OnInit, OnDestroy {
  isOpen = false;
  user: User | null = null;
  canOpenCrm = false;
  isClient = false;
  newMatches = 0;

  readonly accountMenuItems: MenuItem[] = [
    { label: 'My Profile', route: '/my-profile', icon: 'fa-regular fa-user' },
    { label: 'My listings', route: '/my-listings', icon: 'fa-solid fa-list' },
    { label: 'Saved listings', route: '/saved-listings', icon: 'fa-regular fa-heart' },
    { label: 'My viewings', route: '/my-viewings', icon: 'fa-regular fa-calendar-check' },
    { label: 'My coupons', route: '/my-coupons', icon: 'fa-solid fa-ticket' },
  ];

  get menuItems(): MenuItem[] {
    if (this.authService.isOwner)
      return [
        {
          label: 'List your property',
          route: '/upload-apartment',
          icon: 'fa-solid fa-house-circle-check',
          featured: true,
        },
        {
          label: 'Interested clients',
          route: '/interested-clients',
          icon: 'fa-solid fa-user-check',
        },
        ...this.accountMenuItems.filter((item) =>
          ['/my-profile', '/my-listings'].includes(item.route),
        ),
      ];
    // Clients: Velven Discover first, with the number of new matches.
    if (this.isClient)
      return [
        {
          label: 'Velven Discover',
          route: '/discover',
          icon: 'fa-solid fa-wand-magic-sparkles',
          badge: this.newMatches,
          featured: true,
        },
        ...this.accountMenuItems.filter((item) => item.route !== '/my-listings'),
      ];
    // Staff open Interested clients and Reviews from the CRM side menu.
    return this.canOpenCrm
      ? [
          { label: 'CRM workspace', route: '/crm', icon: 'fa-solid fa-address-book' },
          ...this.accountMenuItems,
        ]
      : this.accountMenuItems;
  }


  private subscription?: Subscription;

  constructor(
    private elementRef: ElementRef,
    private authService: AuthService,
    private router: Router,
    private clientService: ClientService,
  ) {}

  ngOnInit(): void {
    this.subscription = this.authService.currentUser$.subscribe((user) => {
      this.user = user;
      this.canOpenCrm = this.authService.canOpenCrm;
      this.isClient = this.authService.isClient;
    });
    this.subscription.add(
      this.clientService.summary$.subscribe((summary) => (this.newMatches = summary.newMatches)),
    );
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /** The menu list is rebuilt on every check; keeping rows by route stops links being replaced mid-click. */
  trackByRoute(_index: number, item: MenuItem): string {
    return item.route;
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
