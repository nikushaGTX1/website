import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { API_URL } from '../../utils/api-config';
import { HomeMatchApiResponse } from '../models/apartment-match-response';
import { EMPTY_HOME_MATCH_PROFILE, HomeMatchProfile } from '../models/home-match-profile';

@Injectable({ providedIn: 'root' })
export class HomeMatchService {
  private readonly storageKey = 'velven-home-match-session';
  private readonly profileSubject = new BehaviorSubject<HomeMatchProfile>(this.restore());
  readonly profile$ = this.profileSubject.asObservable();
  constructor(private http: HttpClient) {}
  get profile(): HomeMatchProfile {
    return this.profileSubject.value;
  }
  update(profile: HomeMatchProfile): void {
    this.profileSubject.next(profile);
    sessionStorage.setItem(this.storageKey, JSON.stringify(profile));
  }
  reset(): void {
    const profile = this.cloneEmpty();
    this.update(profile);
  }
  findMatches(profile: HomeMatchProfile): Observable<HomeMatchApiResponse> {
    return this.http.post<HomeMatchApiResponse>(`${API_URL}/ai-home-match/matches`, profile);
  }
  saveProfile(profile: HomeMatchProfile): Observable<{ id?: number }> {
    return this.http.post<{ id?: number }>(`${API_URL}/ai-home-match/profiles`, profile);
  }
  private restore(): HomeMatchProfile {
    try {
      const value = sessionStorage.getItem(this.storageKey);
      return value ? (JSON.parse(value) as HomeMatchProfile) : this.cloneEmpty();
    } catch {
      return this.cloneEmpty();
    }
  }
  private cloneEmpty(): HomeMatchProfile {
    return {
      ...EMPTY_HOME_MATCH_PROFILE,
      districts: [],
      childrenAgeGroups: [],
      transportation: [],
      lifestyles: [],
      mainPreferences: [],
      additionalRequirements: [],
    };
  }
}
