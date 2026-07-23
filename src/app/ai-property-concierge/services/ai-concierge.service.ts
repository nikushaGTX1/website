import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../../utils/api-config';
import { ApartmentMatchesApiResponse } from '../models/apartment-match-result';
import { HomePreferenceRequest } from '../models/home-preference-request';

@Injectable({ providedIn: 'root' })
export class AiConciergeService {
  constructor(private http: HttpClient) {}

  findMatches(preferences: HomePreferenceRequest): Observable<ApartmentMatchesApiResponse> {
    return this.http.post<ApartmentMatchesApiResponse>(
      `${API_URL}/ai-concierge/matches`,
      preferences,
    );
  }
}
