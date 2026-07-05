import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';

@Component({
  selector: 'app-my-profile',
  standalone: false,
  templateUrl: './my-profile.html',
  styleUrl: './my-profile.css',
})
export class MyProfile implements OnInit, OnDestroy {
  user: User | null = null;

  fullName = '';
  bio = '';
  profilePicture: File | null = null;
  profilePreview = '';

  loading = false;
  saving = false;
  successMessage = '';
  errorMessage = '';

  private subscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subscription = this.authService.currentUser$.subscribe((user) => {
      this.user = user;
      this.fullName = user?.fullName || '';
      this.bio = user?.bio || '';
      this.profilePreview = '';
    });

    this.loading = true;

    this.authService.getProfile().subscribe({
      next: () => {
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Could not load profile.';
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();

    if (this.profilePreview) {
      URL.revokeObjectURL(this.profilePreview);
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;

    this.profilePicture = file;

    if (this.profilePreview) {
      URL.revokeObjectURL(this.profilePreview);
      this.profilePreview = '';
    }

    if (file) {
      this.profilePreview = URL.createObjectURL(file);
    }
  }

  saveSettings(): void {
    if (this.saving) return;

    this.successMessage = '';
    this.errorMessage = '';

    if (!this.fullName.trim()) {
      this.errorMessage = 'Full name is required.';
      return;
    }

    this.saving = true;

    this.authService.updateProfileSettings({
      fullName: this.fullName.trim(),
      bio: this.bio.trim(),
      profilePicture: this.profilePicture,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.profilePicture = null;
        this.profilePreview = '';
        this.successMessage = 'Profile settings updated.';
      },
      error: (err) => {
        this.saving = false;
        console.error(err);
        this.errorMessage = 'Could not update profile settings.';
      },
    });
  }

  get profileImage(): string {
    return toMediaUrl(this.user?.profilePictureUrl || this.user?.profilePicture);
  }

  fixProfileImage(event: Event): void {
    tryNextProfileImageUrl(event);
  }
}
