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
  phoneNumber = '';
  profilePicture: File | null = null;
  profilePreview = '';
  isDragging = false;

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
      this.syncFormWithUser();
    });

    this.loading = true;

    this.authService.getProfile().subscribe({
      next: () => {
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'We could not load your profile. Please try again.';
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.clearLocalPreview();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setProfilePicture(input.files?.[0] || null);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    this.setProfilePicture(event.dataTransfer?.files?.[0] || null);
  }

  resetForm(): void {
    this.syncFormWithUser();
    this.profilePicture = null;
    this.clearLocalPreview();
    this.successMessage = '';
    this.errorMessage = '';
  }

  saveSettings(): void {
    if (this.saving) return;

    this.successMessage = '';
    this.errorMessage = '';

    if (!this.fullName.trim()) {
      this.errorMessage = 'Please enter your full name before saving.';
      return;
    }

    this.saving = true;

    this.authService.updateProfileSettings({
      fullName: this.fullName.trim(),
      bio: this.bio.trim(),
      phoneNumber: this.phoneNumber.trim(),
      profilePicture: this.profilePicture,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.profilePicture = null;
        this.clearLocalPreview();
        this.successMessage = 'Your profile changes have been saved.';
      },
      error: (err) => {
        this.saving = false;
        console.error(err);
        this.errorMessage = 'We could not save your changes. Please try again.';
      },
    });
  }

  get userInitials(): string {
    const source = this.user?.fullName?.trim() || this.user?.userName?.trim() || 'V';
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  get accountType(): string {
    if (this.user?.isAdmin || this.user?.roles?.includes('Admin')) return 'Admin';
    if (this.user?.isAgent || this.user?.roles?.includes('Agent')) return 'Agent';
    return 'Member';
  }

  get selectedFileDetails(): string {
    if (!this.profilePicture) return '';
    const sizeInMb = this.profilePicture.size / (1024 * 1024);
    return `${sizeInMb < 0.1 ? '< 0.1' : sizeInMb.toFixed(1)} MB · Ready to upload`;
  }

  get profileImage(): string {
    return toMediaUrl(this.user?.profilePictureUrl || this.user?.profilePicture);
  }

  fixProfileImage(event: Event): void {
    tryNextProfileImageUrl(event);
  }

  private syncFormWithUser(): void {
    this.fullName = this.user?.fullName || '';
    this.bio = this.user?.bio || '';
    this.phoneNumber = this.user?.phoneNumber || '';
  }

  private setProfilePicture(file: File | null): void {
    this.successMessage = '';
    this.errorMessage = '';

    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      this.errorMessage = 'Please choose a JPG, PNG or WebP image.';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.errorMessage = 'Please choose an image smaller than 5 MB.';
      return;
    }

    this.clearLocalPreview();
    this.profilePicture = file;
    this.profilePreview = URL.createObjectURL(file);
  }

  private clearLocalPreview(): void {
    if (this.profilePreview) {
      URL.revokeObjectURL(this.profilePreview);
      this.profilePreview = '';
    }
  }
}
