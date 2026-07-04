import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user';

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
    { label: 'My Profile', route: '/my-profile', icon: 'profile' },
    { label: 'My listings', route: '/my-listings', icon: 'listings' },
    { label: 'Saved listings', route: '/saved-listings', icon: 'bookmark' },
    { label: 'Premium', route: '/premium', icon: 'premium' },
    { label: 'Balance', route: '/balance', icon: 'balance' },
    { label: 'Payment methods', route: '/payment-methods', icon: 'card' },
    { label: 'My business', route: '/my-business', icon: 'business' },
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
}
