import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, tap } from 'rxjs';
import { API_URL } from '../utils/api-config';
import { AuthService } from './auth.service';
import { ClientNotificationPage } from '../models/client';

/** Anonymous requirements of a client whose saved search matches a listing. */
export interface InterestedClient {
  searchId: number;
  profile: Record<string, any>;
  searchingSince: string;
  isNew: boolean;
}

export interface ListingInterest {
  apartmentId: number;
  title: string;
  titleEn?: string | null;
  titleKa?: string | null;
  titleRu?: string | null;
  district: string;
  street: string;
  price: number;
  bedrooms: number;
  sizeSquareMeters: number;
  imageUrl?: string | null;
  description: string;
  clients: InterestedClient[];
}

/**
 * Owners and agents: clients looking for homes like the ones they listed, and the bell alerts
 * when a client's saved search matches one of their listings. Badge refreshes every two minutes.
 */
@Injectable({ providedIn: 'root' })
export class ListingInterestService {
  private readonly apiUrl = `${API_URL}/listing-interest`;
  private readonly unreadSubject = new BehaviorSubject<number>(0);
  readonly unread$ = this.unreadSubject.asObservable();
  private pollTimer?: number;

  constructor(private http: HttpClient, private auth: AuthService, private zone: NgZone) {
    this.auth.currentUser$.subscribe(() => {
      if (this.enabled) {
        this.refreshSummary();
        this.startPolling();
      } else {
        window.clearInterval(this.pollTimer);
        this.pollTimer = undefined;
        this.unreadSubject.next(0);
      }
    });
  }

  /** Anyone who lists homes: owners and staff (agents, uploaders, managers). */
  get enabled(): boolean {
    return this.auth.isLoggedIn && !this.auth.isClient && (this.auth.isOwner || this.auth.isStaff);
  }

  refreshSummary(): void {
    if (!this.enabled) return;
    this.http.get<{ unread: number }>(`${this.apiUrl}/notifications/summary`)
      .pipe(catchError(() => of(null)))
      .subscribe((summary) => summary && this.unreadSubject.next(summary.unread));
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.zone.runOutsideAngular(() => {
      this.pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') this.zone.run(() => this.refreshSummary());
      }, 2 * 60_000);
    });
  }

  getInterests(): Observable<ListingInterest[]> {
    return this.http.get<ListingInterest[]>(this.apiUrl);
  }

  getNotifications(page = 1, pageSize = 10): Observable<ClientNotificationPage> {
    return this.http.get<ClientNotificationPage>(`${this.apiUrl}/notifications`, { params: { page, pageSize } })
      .pipe(tap((result) => this.unreadSubject.next(result.unread)));
  }

  markRead(id: number): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/notifications/${id}/read`, {}).pipe(tap(() => this.refreshSummary()));
  }

  markAllRead(): Observable<unknown> {
    this.unreadSubject.next(0);
    return this.http.post(`${this.apiUrl}/notifications/read-all`, {}).pipe(tap(() => this.refreshSummary()));
  }
}
