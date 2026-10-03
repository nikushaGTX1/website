import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { safeReturnUrl } from '../utils/return-url';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  isRegisterMode = false;
  isSubmitting = false;

  registerData = {
    userName: '',
    fullName: '',
    email: '',
    password: ''
  };

  loginData = {
    email: '',
    password: ''
  };

  errorMessage = '';
  successMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

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
    this.isSubmitting = true;

    this.authService.register({
      userName: this.registerData.userName,
      fullName: this.registerData.fullName,
      email: this.registerData.email,
      password: this.registerData.password
    }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.isRegisterMode = false;
        this.loginData.email = this.registerData.email;
        this.openVerify(this.registerData.email, 'We sent a 6-digit code to your email. Enter it to activate your account.');
      },
      error: (err) => {
        console.error(err);
        this.isSubmitting = false;

        if (err.error?.errors) {
          this.errorMessage = Object.values(err.error.errors).flat().join(' ');
        } else if (Array.isArray(err.error)) {
          this.errorMessage = err.error.map((x: any) => x.description).join(' ');
        } else if (typeof err.error === 'string') {
          this.errorMessage = err.error;
        } else {
          this.errorMessage = 'Registration failed.';
        }
      }
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
        void this.router.navigateByUrl(this.returnUrl ?? '/main');
      },
      error: (err) => {
        this.isSubmitting = false;
        if (err?.status === 403 && err.error?.needsVerification) {
          this.openVerify(err.error.email || this.loginData.email, 'Please verify your email first. Enter the code we sent you.');
          return;
        }
        this.errorMessage = 'Invalid email or password.';
      }
    });
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

  submitVerify(): void {
    if (this.isSubmitting || !this.code.trim()) return;
    this.isSubmitting = true;
    this.errorMessage = '';
    this.authService.verifyEmail(this.codeEmail, this.code).subscribe({
      next: () => {
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
    const request = this.step === 'verify'
      ? this.authService.resendVerification(this.codeEmail)
      : this.authService.forgotPassword(this.codeEmail);
    this.isSubmitting = true;
    request.subscribe({
      next: () => {
        this.isSubmitting = false;
        this.errorMessage = '';
        this.successMessage = 'A new code has been sent.';
      },
      error: () => {
        this.isSubmitting = false;
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

  submitReset(): void {
    if (this.isSubmitting || !this.code.trim() || this.newPassword.length < 6) {
      if (this.newPassword && this.newPassword.length < 6) this.errorMessage = 'Password must be at least 6 characters.';
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
