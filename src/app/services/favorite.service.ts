import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
import { Apartment } from '../models/apartment';
import { AuthService } from './auth.service';
import { API_URL } from '../utils/api-config';

type FavoriteRecord = {
  apartmentId?: number;
  apartment?: Apartment;
  id?: number;
};

@Injectable({ providedIn: 'root' })
export class FavoriteService {
  private readonly apiUrl = `${API_URL}/Favorites`;
  private readonly favoriteIdsSubject = new BehaviorSubject<Set<number>>(new Set());
  private loadRequest$?: Observable<Set<number>>;

  readonly favoriteIds$ = this.favoriteIdsSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  isFavorite(apartmentId: number): boolean {
    return this.favoriteIdsSubject.value.has(apartmentId);
  }

  loadFavorites(force = false): Observable<Set<number>> {
    if (!this.authService.isLoggedIn) {
      this.favoriteIdsSubject.next(new Set());
      return of(new Set<number>());
    }

    if (!this.loadRequest$ || force) {
      this.loadRequest$ = this.http.get<unknown>(this.apiUrl).pipe(
        map((response) => this.extractFavoriteIds(response)),
        tap((ids) => this.favoriteIdsSubject.next(ids)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }

    return this.loadRequest$;
  }

  toggleFavorite(apartmentId: number): Observable<boolean> {
    const removing = this.isFavorite(apartmentId);
    const request$ = removing
      ? this.http.delete<unknown>(`${this.apiUrl}/${apartmentId}`)
      : this.http.post<unknown>(`${this.apiUrl}/${apartmentId}`, {});

    return request$.pipe(
      map(() => !removing),
      tap((isFavorite) => {
        const next = new Set(this.favoriteIdsSubject.value);
        isFavorite ? next.add(apartmentId) : next.delete(apartmentId);
        this.favoriteIdsSubject.next(next);
      }),
    );
  }

  private extractFavoriteIds(response: unknown): Set<number> {
    const payload = response as
      | FavoriteRecord[]
      | { favorites?: FavoriteRecord[]; items?: FavoriteRecord[]; data?: FavoriteRecord[] };
    const records = Array.isArray(payload)
      ? payload
      : payload?.favorites || payload?.items || payload?.data || [];

    return new Set(
      records
        .map((record) => Number(record.apartmentId ?? record.apartment?.id ?? record.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    );
  }
}
