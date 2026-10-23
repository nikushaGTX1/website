import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { API_URL } from '../utils/api-config';
import { AuthService } from './auth.service';
import { TranslationService } from './translation.service';
import { CurrencyService } from './currency.service';
import { HomeMatchProfile } from '../ai-home-match/models/home-match-profile';
import {
  ClientNotificationPage,
  ClientPreferences,
  ClientSummary,
  SavedSearch,
  SavedSearchMatchRecord,
} from '../models/client';

/** A finished Velven Match search kept while a visitor signs in or registers. */
const PENDING_SEARCH_KEY = 'velven-pending-match-search';
const EMPTY_SUMMARY: ClientSummary = { unread: 0, newMatches: 0 };

/**
 * Velven Discover for client accounts: saved Velven Match searches, their new matches, alerts
 * and alert preferences. Badge counts refresh every two minutes while the tab is visible.
 */
@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly apiUrl = `${API_URL}/client`;
  private readonly summarySubject = new BehaviorSubject<ClientSummary>(EMPTY_SUMMARY);
  readonly summary$ = this.summarySubject.asObservable();
  private pollTimer?: number;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private zone: NgZone,
    private translation: TranslationService,
    private currency: CurrencyService,
  ) {
    this.auth.currentUser$.subscribe(() => {
      if (this.auth.isClient) {
        this.getPreferences().subscribe({ next: (preferences) => {
          if (preferences.preferredLanguage) this.translation.setLanguage(preferences.preferredLanguage);
        }, error: () => undefined });
        this.refreshSummary();
        this.startPolling();
      } else {
        this.stopPolling();
        this.summarySubject.next(EMPTY_SUMMARY);
      }
    });
  }

  get summary(): ClientSummary {
    return this.summarySubject.value;
  }

  // ---------- Badges ----------

  refreshSummary(): void {
    if (!this.auth.isClient) return;
    this.http
      .get<ClientSummary>(`${this.apiUrl}/notifications/summary`)
      .pipe(catchError(() => of(null)))
      .subscribe((summary) => summary && this.summarySubject.next(summary));
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.zone.runOutsideAngular(() => {
      this.pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') this.zone.run(() => this.refreshSummary());
      }, 2 * 60_000);
      document.addEventListener('visibilitychange', this.onVisible);
    });
  }

  private stopPolling(): void {
    window.clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private readonly onVisible = (): void => {
    if (document.visibilityState === 'visible') this.zone.run(() => this.refreshSummary());
  };

  // ---------- Saved searches ----------

  getSearches(): Observable<SavedSearch[]> {
    return this.http.get<SavedSearch[]>(`${this.apiUrl}/searches`);
  }

  saveSearch(profile: HomeMatchProfile, name: string): Observable<{ id: number; name: string; existed: boolean }> {
    return this.http.post<{ id: number; name: string; existed: boolean }>(`${this.apiUrl}/searches`, {
      name,
      profile: this.cleanProfile(profile),
    });
  }

  updateSearch(
    id: number,
    changes: { name?: string; profile?: HomeMatchProfile; notificationsEnabled?: boolean },
  ): Observable<{ id: number; name: string; notificationsEnabled: boolean }> {
    return this.http.put<{ id: number; name: string; notificationsEnabled: boolean }>(
      `${this.apiUrl}/searches/${id}`,
      { ...changes, profile: changes.profile ? this.cleanProfile(changes.profile) : undefined },
    );
  }

  deleteSearch(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/searches/${id}`).pipe(tap(() => this.refreshSummary()));
  }

  /** Saved answers only: plain data, no undefined values. */
  private cleanProfile(profile: HomeMatchProfile): HomeMatchProfile {
    const snapshot = profile.budgetConversion;
    const conversion = snapshot && snapshot.currency === profile.currency && snapshot.min === profile.budgetMin &&
      snapshot.max === profile.budgetMax ? snapshot : {
        currency: profile.currency, min: profile.budgetMin, max: profile.budgetMax, ...this.currency.rates,
      };
    return JSON.parse(JSON.stringify({ ...profile, budgetConversion: conversion })) as HomeMatchProfile;
  }

  // ---------- Matches ----------

  getMatches(searchId?: number): Observable<SavedSearchMatchRecord[]> {
    const query = searchId ? `?searchId=${searchId}` : '';
    return this.http.get<SavedSearchMatchRecord[]>(`${this.apiUrl}/matches${query}`);
  }

  markMatchesSeen(apartmentIds: number[], searchId?: number): Observable<unknown> {
    if (!apartmentIds.length) return of(null);
    return this.http
      .post(`${this.apiUrl}/matches/seen`, { searchId, apartmentIds })
      .pipe(tap(() => this.refreshSummary()));
  }

  // ---------- Notifications ----------

  getNotifications(page = 1, pageSize = 20): Observable<ClientNotificationPage> {
    return this.http
      .get<ClientNotificationPage>(`${this.apiUrl}/notifications?page=${page}&pageSize=${pageSize}`)
      .pipe(
        tap((result) =>
          this.summarySubject.next({ ...this.summarySubject.value, unread: result.unread }),
        ),
      );
  }

  markRead(id: number): Observable<unknown> {
    const summary = this.summarySubject.value;
    this.summarySubject.next({ ...summary, unread: Math.max(0, summary.unread - 1) });
    return this.http.post(`${this.apiUrl}/notifications/${id}/read`, {}).pipe(
      catchError((error) => {
        this.refreshSummary();
        throw error;
      }),
    );
  }

  markAllRead(): Observable<unknown> {
    this.summarySubject.next({ ...this.summarySubject.value, unread: 0 });
    return this.http.post(`${this.apiUrl}/notifications/read-all`, {}).pipe(catchError((error) => {
      this.refreshSummary();
      throw error;
    }));
  }

  // ---------- Preferences ----------

  getPreferences(): Observable<ClientPreferences> {
    return this.http.get<ClientPreferences>(`${this.apiUrl}/preferences`);
  }

  updatePreferences(changes: Partial<Omit<ClientPreferences, 'emailConfirmed'>>): Observable<ClientPreferences> {
    return this.http.put<ClientPreferences>(`${this.apiUrl}/preferences`, changes);
  }

  // ---------- A visitor's search, saved after signing in ----------

  keepPendingSearch(profile: HomeMatchProfile, name: string): void {
    try {
      localStorage.setItem(PENDING_SEARCH_KEY, JSON.stringify({ profile, name, at: Date.now() }));
    } catch {
      // Storage blocked: the visitor can still run Velven Match again after signing in.
    }
  }

  hasPendingSearch(): boolean {
    return !!this.readPendingSearch();
  }

  /** Saves the search a visitor finished before signing in; emits the new search id (or null). */
  savePendingSearch(): Observable<number | null> {
    const pending = this.readPendingSearch();
    if (!pending || !this.auth.isClient) return of(null);
    return this.saveSearch(pending.profile, pending.name).pipe(
      tap(() => localStorage.removeItem(PENDING_SEARCH_KEY)),
      map((saved) => saved.id),
      catchError(() => of(null)),
    );
  }

  private readPendingSearch(): { profile: HomeMatchProfile; name: string } | null {
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_SEARCH_KEY) || 'null');
      // A day is plenty to finish signing up; older answers are dropped.
      if (!pending?.profile || Date.now() - Number(pending.at) > 24 * 60 * 60 * 1000) return null;
      return pending;
    } catch {
      return null;
    }
  }
}
