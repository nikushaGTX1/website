import { Component } from '@angular/core';
import { Router } from '@angular/router';
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
    private router: Router
  ) {}

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
        this.successMessage = 'Account created successfully! Please log in.';
        this.isRegisterMode = false;
        this.isSubmitting = false;
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
        this.router.navigate(['/main']);
      },
      error: () => {
        this.isSubmitting = false;
        this.errorMessage = 'Invalid email or password.';
      }
    });
  }
}
