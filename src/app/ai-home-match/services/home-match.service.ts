import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { API_URL } from '../../utils/api-config';
import { HomeMatchApiResponse } from '../models/apartment-match-response';
import { EMPTY_HOME_MATCH_PROFILE, HomeMatchProfile } from '../models/home-match-profile';
import { CurrencyService } from '../../services/currency.service';
import { budgetRangeUsd } from './mandatory-requirements';

@Injectable({ providedIn: 'root' })
export class HomeMatchService {
  private readonly profileSubject = new BehaviorSubject<HomeMatchProfile>(this.cloneEmpty());
  readonly profile$ = this.profileSubject.asObservable();
  constructor(
    private http: HttpClient,
    private currency: CurrencyService,
  ) {}
  get profile(): HomeMatchProfile {
    return this.profileSubject.value;
  }
  update(profile: HomeMatchProfile): void {
    this.profileSubject.next(profile);
  }
  reset(): void {
    const profile = this.cloneEmpty();
    this.update(profile);
  }
  findMatches(profile: HomeMatchProfile): Observable<HomeMatchApiResponse> {
    // The Buy flow skips the pet question, leaving hasPet null; the API expects a boolean
    // (a null made every Buy calculation fail with HTTP 400).
    // Listing prices are in USD, so send the budget converted to USD for the API's scoring.
    const budget = budgetRangeUsd(profile, this.currency.rates);
    return this.http.post<HomeMatchApiResponse>(`${API_URL}/ai-home-match/matches`, {
      ...profile,
      hasPet: profile.hasPet === true,
      budgetMin: Math.round(budget.min ?? 0),
      budgetMax: Math.round(budget.max ?? 0),
      currency: 'USD',
    });
  }
  /**
   * "Save My Profile": keeps the answers for this browser tab so a reload can resume them
   * (VELVEN-017). The API has no profile storage endpoint.
   */
  saveToSession(profile: HomeMatchProfile): boolean {
    try {
      sessionStorage.setItem(HomeMatchService.SESSION_KEY, JSON.stringify(profile));
      return true;
    } catch {
      return false;
    }
  }

  /** Loads answers saved earlier in this tab; false when there are none. */
  restoreFromSession(): boolean {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HomeMatchService.SESSION_KEY) || 'null');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return false;
      this.update({ ...this.cloneEmpty(), ...saved });
      return true;
    } catch {
      return false;
    }
  }

  private static readonly SESSION_KEY = 'velven:home-match-profile';
  private cloneEmpty(): HomeMatchProfile {
    return {
      ...EMPTY_HOME_MATCH_PROFILE,
      districts: [],
      childrenAgeGroups: [],
      transportation: [],
      lifestyles: [],
      topPriorities: [],
    };
  }
}
