import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../utils/api-config';

/** Who a public review link belongs to (name and photo only). */
export interface ReviewLink {
  slug: string;
  agentName: string;
  profilePicture?: string | null;
}

export interface SubmitReview {
  rating: number;
  comment?: string;
  customerName?: string;
  /** Created once per form so a repeated submit is stored only once. */
  submissionId: string;
  /** Milliseconds from page load to submit (basic bot check). */
  elapsedMs: number;
  /** Hidden honeypot; must stay empty. */
  website?: string;
}

export interface AgentReviewItem {
  id: string;
  customerName?: string | null;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export interface ReviewDashboard {
  agentId: string;
  agentName: string;
  slug: string;
  summary: {
    average: number;
    total: number;
    /** Index 0 = 1 star … index 4 = 5 stars. */
    distribution: number[];
  };
  reviews: AgentReviewItem[];
}

export type ReviewSort = 'newest' | 'oldest';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly apiUrl = `${API_URL}/Reviews`;

  constructor(private readonly http: HttpClient) {}

  getLink(slug: string): Observable<ReviewLink> {
    return this.http.get<ReviewLink>(`${this.apiUrl}/link/${encodeURIComponent(slug)}`);
  }

  submit(slug: string, review: SubmitReview): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/link/${encodeURIComponent(slug)}`, review);
  }

  getMine(rating: number | null, sort: ReviewSort): Observable<ReviewDashboard> {
    let params = new HttpParams().set('sort', sort);
    if (rating) params = params.set('rating', rating);
    return this.http.get<ReviewDashboard>(`${this.apiUrl}/mine`, { params });
  }
}

/** Full public URL of a review link, e.g. https://velven.ge/review/giorgi-lomidze. */
export function reviewLinkUrl(slug: string): string {
  return `${window.location.origin}/review/${slug}`;
}
