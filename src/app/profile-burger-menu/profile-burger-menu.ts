import { Component, ElementRef, HostListener, OnInit } from '@angular/core';

interface UserProfile {
  fullName: string;
  pin: string;
}

interface MenuItem {
  label: string;
  route: string;
  icon: string; // svg path key, used in the template
}

@Component({
  selector: 'app-profile-burger-menu',
  standalone: false,
  templateUrl: './profile-burger-menu.html',
  styleUrl: './profile-burger-menu.css',
})
export class ProfileBurgerMenu implements OnInit { // Added 'implements OnInit'

  isOpen = false;
  user: UserProfile | null = null;

  menuItems: MenuItem[] = [
    { label: 'My Profile',      route: '/my-profile',       icon: 'profile' },
    { label: 'My listings',      route: '/my-listings',      icon: 'listings' },
    { label: 'Saved listings',    route: '/saved-listings',   icon: 'bookmark' },
    { label: 'Premium',           route: '/premium',          icon: 'premium' },
    { label: 'Balance',           route: '/balance',          icon: 'balance' },
    { label: 'Payment methods',   route: '/payment-methods',  icon: 'card' },
    { label: 'My business',       route: '/my-business',      icon: 'business' },
  ];

  constructor(private elementRef: ElementRef) {}

  ngOnInit(): void {
    this.loadUser();
  }

  toggleMenu(): void {
    this.isOpen = !this.isOpen;
  }

  closeMenu(): void {
    this.isOpen = false;
  }

  // Close the dropdown when clicking outside the component
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  // Replace this with a real call to your auth/user service
  private loadUser(): void {
    // Example:
    // this.userService.getCurrentUser().subscribe(user => {
    //   this.user = { fullName: user.fullName, pin: 'PIN: ' + user.pin };
    // });
  }
}