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
  canOpenCrm = false;

  readonly accountMenuItems: MenuItem[] = [
    { label: 'My Profile', route: '/my-profile', icon: 'fa-regular fa-user' },
    { label: 'My listings', route: '/my-listings', icon: 'fa-solid fa-list' },
    { label: 'Saved listings', route: '/saved-listings', icon: 'fa-regular fa-heart' },
  ];

  get menuItems(): MenuItem[] {
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
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subscription = this.authService.currentUser$.subscribe((user) => {
      this.user = user;
      this.canOpenCrm = this.authService.canOpenCrm;
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
