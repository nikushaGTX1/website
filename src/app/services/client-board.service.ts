import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_URL } from '../utils/api-config';
import { HomeMatchProfile } from '../ai-home-match/models/home-match-profile';
import { CurrencyService } from './currency.service';

export interface BoardClient {
  id: number;
  identityVerified: boolean;
  nationality: string | null;
  profile: HomeMatchProfile & { minSize?: number };
  agent: { name: string; phone: string | null; photo: string | null };
}
export interface BoardPage {
  items: BoardClient[];
  total: number;
  page: number;
  pageSize: number;
}
export interface IntakeLink {
  id: number;
  token: string;
  slug: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface IntakeSubmission {
  id: number;
  firstName: string;
  phone: string;
  status: string;
  createdAt: string;
  leadId: number;
  published: boolean;
}
export interface IntakeContact {
  firstName: string;
  phone: string;
  nationality: string;
  consent: boolean;
  publishConsent: boolean;
}

@Injectable({ providedIn: 'root' })
export class ClientBoardService {
  constructor(
    private http: HttpClient,
    private currency: CurrencyService,
  ) {}
  board(filters: Record<string, string | number | boolean>) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== '') params = params.set(key, value);
    return this.http.get<BoardPage>(`${API_URL}/client-board`, { params });
  }
  submit(token: string, profile: HomeMatchProfile, contact: IntakeContact) {
    const snapshot = profile.budgetConversion;
    const budgetConversion =
      snapshot &&
      snapshot.currency === profile.currency &&
      snapshot.min === profile.budgetMin &&
      snapshot.max === profile.budgetMax
        ? snapshot
        : {
            currency: profile.currency,
            min: profile.budgetMin,
            max: profile.budgetMax,
            ...this.currency.rates,
          };
    return this.http.post<{ id: number }>(`${API_URL}/client-intake/${encodeURIComponent(token)}`, {
      profile: { ...profile, budgetConversion },
      ...contact,
    });
  }
  links() {
    return this.http.get<IntakeLink[]>(`${API_URL}/client-intake-links`);
  }
  createLink() {
    return this.http.post<IntakeLink>(`${API_URL}/client-intake-links`, {});
  }
  revoke(id: number) {
    return this.http.delete<void>(`${API_URL}/client-intake-links/${id}`);
  }
  submissions(page = 1) {
    return this.http.get<{ items: IntakeSubmission[]; total: number }>(
      `${API_URL}/client-profiles`,
      { params: { page } },
    );
  }
  status(id: number, status: string) {
    return this.http.patch<void>(`${API_URL}/client-profiles/${id}/status`, { status });
  }
}
