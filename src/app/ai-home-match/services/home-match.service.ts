import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map, expand, EMPTY, reduce } from 'rxjs';
import { API_URL } from '../../utils/api-config';
import { HomeMatchApiResponse } from '../models/apartment-match-response';
import { EMPTY_HOME_MATCH_PROFILE, HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchResult } from '../models/home-match-result';
import { CurrencyService } from '../../services/currency.service';
import {
  budgetRangeUsd,
  matchesPropertyGoal,
  petsExplicitlyProhibited,
  withinBudgetCeiling,
} from './mandatory-requirements';
import { applyPriorityScoring } from './priority-scoring';

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
  findMatches(profile: HomeMatchProfile, page = 1): Observable<HomeMatchApiResponse> {
    // The Buy flow skips the pet question, leaving hasPet null; the API expects a boolean
    // (a null made every Buy calculation fail with HTTP 400).
    // Listing prices are in USD, so send the budget converted to USD for the API's scoring.
    const budget = budgetRangeUsd(profile, this.currency.rates);
    return this.http.post<HomeMatchApiResponse>(`${API_URL}/ai-home-match/matches?page=${page}`, {
      ...profile,
      hasPet: profile.hasPet === true,
      budgetMin: Math.round(budget.min ?? 0),
      budgetMax: Math.round(budget.max ?? 0),
      currency: 'USD',
    });
  }
  /**
   * The results pipeline shared by Velven Match and Velven Discover: hard filters (deal type,
   * budget ceiling, pets the listing prohibits), then lifestyle ranking.
   */
  rankMatches(response: HomeMatchApiResponse, profile: HomeMatchProfile): HomeMatchResult[] {
    return (Array.isArray(response) ? response : response.matches)
      .filter(
        (match) =>
          matchesPropertyGoal(match.apartment, profile) &&
          // Prices are stored in USD; the budget is converted from GEL/EUR before comparing.
          // Homes below the minimum stay in the list and are classified as alternatives.
          withinBudgetCeiling(Number(match.apartment.price), profile, this.currency.rates) &&
          !petsExplicitlyProhibited(match.apartment, profile),
      )
      .map((match) => applyPriorityScoring(match, profile))
      .sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
  }

  /** findMatches + rankMatches. */
  findRankedMatches(profile: HomeMatchProfile): Observable<HomeMatchResult[]> {
    return this.findMatches(profile).pipe(
      expand((response, index) => !Array.isArray(response) && (index + 1) * 50 < response.totalMatches
        ? this.findMatches(profile, index + 2) : EMPTY),
      reduce((all, response) => [...all, ...(Array.isArray(response) ? response : response.matches)], [] as HomeMatchResult[]),
      map((matches) => this.rankMatches(matches, profile)),
    );
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

  /** Forgets answers kept for this tab ("Find My Perfect Home" starts a new search). */
  clearSession(): void {
    try {
      sessionStorage.removeItem(HomeMatchService.SESSION_KEY);
    } catch {
      // Storage blocked: nothing was kept.
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
