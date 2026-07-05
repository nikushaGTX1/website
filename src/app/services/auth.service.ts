import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, switchMap, tap } from 'rxjs';
import { AuthResponse, User } from '../models/user';

export interface RegisterRequest {
  userName: string;
  fullName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ProfileSettingsRequest {
  fullName: string;
  bio: string;
  profilePicture?: File | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://localhost:7111/api/Auth';
  private profileUrl = 'https://localhost:7111/api/Profile';
  private currentUserSubject = new BehaviorSubject<User | null>(this.readStoredUser());

  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  get isLoggedIn(): boolean {
    return !!this.getToken();
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get isAgent(): boolean {
    return this.hasAnyRole(['agent', 'admin']);
  }

  get isAdmin(): boolean {
    return this.hasAnyRole(['admin']);
  }

  register(data: RegisterRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data);
  }

  login(data: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, data).pipe(
      tap((response) => this.saveLogin(response))
    );
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.profileUrl}/me`).pipe(
      tap((user) => this.saveUser(user))
    );
  }

  updateProfileSettings(data: ProfileSettingsRequest): Observable<User> {
    const formData = new FormData();
    formData.append('FullName', data.fullName);
    formData.append('Bio', data.bio);

    if (data.profilePicture) {
      formData.append('ProfilePicture', data.profilePicture);
    }

    return this.http.put<unknown>(`${this.profileUrl}/settings`, formData).pipe(
      switchMap(() => this.getProfile())
    );
  }

  saveLogin(response: AuthResponse): void {
    localStorage.setItem('token', response.token);
    this.saveUser(response.user);
  }

  saveUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  hasAnyRole(roles: string[]): boolean {
    const expected = roles.map((role) => role.toLowerCase());
    const user = this.currentUser;
    const userRoles = [
      user?.role,
      ...(user?.roles || []),
      user?.isAgent ? 'agent' : '',
      user?.isAdmin ? 'admin' : '',
      ...this.readTokenRoles(),
    ]
      .filter((role): role is string => !!role)
      .map((role) => role.toLowerCase());

    return userRoles.some((role) => expected.includes(role));
  }

  private readStoredUser(): User | null {
    const raw = localStorage.getItem('user');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  private readTokenRoles(): string[] {
    const token = this.getToken();
    if (!token) {
      return [];
    }

    const payload = token.split('.')[1];
    if (!payload) {
      return [];
    }

    try {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const parsed = JSON.parse(atob(normalized)) as Record<string, unknown>;
      const roleClaims = [
        parsed['role'],
        parsed['roles'],
        parsed['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'],
      ];

      return roleClaims.flatMap((claim) => {
        if (Array.isArray(claim)) {
          return claim.filter((role): role is string => typeof role === 'string');
        }

        return typeof claim === 'string' ? [claim] : [];
      });
    } catch {
      return [];
    }
  }
}
