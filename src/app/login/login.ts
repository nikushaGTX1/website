import { Component } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from '../utils/return-url';
import { AuthService } from '../services/auth.service';
import { NgIf, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CodeDialogComponent } from '../shared/code-dialog/code-dialog.component';
import { ClientService } from '../services/client.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrl: './login.css',
  imports: [NgIf, RouterLink, NgTemplateOutlet, FormsModule, CodeDialogComponent],
})
export class Login {
  isRegisterMode = false;
  isSubmitting = false;

  registerData = {
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  };

  /** Set right after sign-up so verifying the email can sign the new client straight in. */
  private justRegistered: { email: string; password: string } | null = null;

  loginData = {
    email: '',
    password: '',
  };

  errorMessage = '';
  successMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private clientService: ClientService,
  ) {
    // /register opens the sign-up form directly.
    this.isRegisterMode = !!this.route.snapshot.data['register'];
  }

  /** A visitor finished Velven Match and asked to save the search. */
  get hasPendingSearch(): boolean {
    return this.clientService.hasPendingSearch();
  }

  /** Where to continue after signing in (set by the auth guard or a "save" action). */
  get returnUrl(): string | null {
    return safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  }

  /** Owners arriving from "List your property" get context about why an account is needed. */
  get isOwnerFlow(): boolean {
    return !!this.returnUrl?.startsWith('/upload-apartment');
  }

  toggleMode(): void {
    this.isRegisterMode = !this.isRegisterMode;
    this.errorMessage = '';
    this.successMessage = '';
  }

  register(): void {
    if (this.isSubmitting) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    if (this.registerData.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters.';
      return;
    }
    if (this.registerData.password !== this.registerData.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }
    this.isSubmitting = true;

    this.authService
      .register({
        fullName: this.registerData.fullName.trim(),
        email: this.registerData.email.trim(),
        password: this.registerData.password,
        confirmPassword: this.registerData.confirmPassword,
        phoneNumber: this.registerData.phoneNumber.trim() || undefined,
      })
      .subscribe({
        next: (response) => {
          this.isSubmitting = false;
          this.justRegistered = {
            email: response.email || this.registerData.email.trim(),
            password: this.registerData.password,
          };
          this.isRegisterMode = false;
          this.loginData.email = this.registerData.email;
          this.openVerify(
            response.email || this.registerData.email.trim(),
            response.emailSent === false
              ? ''
              : 'We sent a 6-digit code to your email. Enter it to activate your account.',
          );
          if (response.emailSent === false) {
            this.errorMessage =
              'Your account was created, but we could not send the verification email. Please try Resend code.';
          }
        },
        error: (err) => {
          console.error(err);
          this.isSubmitting = false;

          if (err.error?.errors) {
            this.errorMessage = Object.values(err.error.errors).flat().join(' ');
          } else if (Array.isArray(err.error)) {
            this.errorMessage = err.error.map((x: any) => x.description).join(' ');
          } else if (err.error?.message) {
            this.errorMessage = err.error.message;
          } else if (typeof err.error === 'string') {
            this.errorMessage = err.error;
          } else {
            this.errorMessage = 'Registration failed.';
          }
        },
      });
  }

  login(): void {
    if (this.isSubmitting) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isSubmitting = true;

    this.authService.login(this.loginData).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.continueAfterSignIn();
      },
      error: (err) => {
        this.isSubmitting = false;
        if (err?.status === 403 && err.error?.needsVerification) {
          this.openVerify(
            err.error.email || this.loginData.email,
            'Please verify your email first. Enter the code we sent you.',
          );
          return;
        }
        this.errorMessage = 'Invalid email or password.';
      },
    });
  }

  /**
   * After signing in: save a Velven Match search the visitor finished before, then continue
   * to where they were going. New clients (and anyone who just saved a search) land on
   * Velven Discover.
   */
  private continueAfterSignIn(newAccount = false): void {
    if (this.authService.isClient && this.clientService.hasPendingSearch()) {
      this.clientService.savePendingSearch().subscribe((searchId) => {
        void this.router.navigate(['/discover'], {
          queryParams: searchId ? { search: searchId, saved: 1 } : {},
        });
      });
      return;
    }
    const fallback = newAccount && this.authService.isClient ? '/discover' : '/main';
    void this.router.navigateByUrl(this.returnUrl ?? fallback);
  }

  // ---------- Email code steps (verify / forgot password) ----------

  step: 'form' | 'verify' | 'forgot' | 'reset' = 'form';
  codeEmail = '';
  code = '';
  newPassword = '';

  private openVerify(email: string, message: string): void {
    this.step = 'verify';
    this.codeEmail = email;
    this.code = '';
    this.errorMessage = '';
    this.successMessage = message;
  }

  backToLogin(message = ''): void {
    this.step = 'form';
    this.isRegisterMode = false;
    this.code = '';
    this.newPassword = '';
    this.errorMessage = '';
    this.successMessage = message;
  }

  openForgot(): void {
    this.step = 'forgot';
    this.codeEmail = this.loginData.email;
    this.errorMessage = '';
    this.successMessage = '';
  }

  submitVerify(code: string): void {
    this.code = code;
    if (this.isSubmitting || !this.code.trim()) return;
    this.isSubmitting = true;
    this.errorMessage = '';
    this.authService.verifyEmail(this.codeEmail, this.code).subscribe({
      next: () => {
        const fresh = this.justRegistered;
        if (fresh && fresh.email.toLowerCase() === this.codeEmail.trim().toLowerCase()) {
          // Just signed up in this tab: sign straight in instead of asking for the password again.
          this.justRegistered = null;
          this.authService.login({ email: fresh.email, password: fresh.password }).subscribe({
            next: () => {
              this.isSubmitting = false;
              this.continueAfterSignIn(true);
            },
            error: () => {
              this.isSubmitting = false;
              this.loginData.email = fresh.email;
              this.backToLogin('Email verified! You can sign in now.');
            },
          });
          return;
        }
        this.isSubmitting = false;
        this.backToLogin('Email verified! You can sign in now.');
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.message || 'The code is incorrect or has expired.';
      },
    });
  }

  resendCode(): void {
    if (this.isSubmitting) return;
    const request =
      this.step === 'verify'
        ? this.authService.resendVerification(this.codeEmail)
        : this.authService.forgotPassword(this.codeEmail);
    this.isSubmitting = true;
    request.subscribe({
      next: () => {
        this.isSubmitting = false;
        this.errorMessage = '';
        this.successMessage = 'If your account needs a code, a new code has been sent.';
      },
      error: () => {
        this.isSubmitting = false;
        this.successMessage = '';
        this.errorMessage = 'Could not send the code. Please try again.';
      },
    });
  }

  submitForgot(): void {
    if (this.isSubmitting || !this.codeEmail.trim()) return;
    this.isSubmitting = true;
    this.errorMessage = '';
    this.authService.forgotPassword(this.codeEmail.trim()).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.step = 'reset';
        this.code = '';
        this.successMessage = 'If an account exists for this email, we sent a 6-digit code.';
      },
      error: () => {
        this.isSubmitting = false;
        this.errorMessage = 'Could not send the code. Please try again.';
      },
    });
  }

  submitReset(code: string, password: string): void {
    this.code = code;
    this.newPassword = password;
    if (this.isSubmitting || !this.code.trim() || this.newPassword.length < 6) {
      if (this.newPassword && this.newPassword.length < 6)
        this.errorMessage = 'Password must be at least 6 characters.';
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';
    this.authService.resetPassword(this.codeEmail.trim(), this.code, this.newPassword).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.loginData.email = this.codeEmail.trim();
        this.backToLogin('Password changed. You can sign in now.');
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = Array.isArray(err.error)
          ? err.error.map((x: any) => x.description).join(' ')
          : err.error?.message || 'The code is incorrect or has expired.';
      },
    });
  }
}
