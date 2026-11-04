import { HttpClient } from '@angular/common/http';
import { computed, Injectable, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_URL } from '../utils/api-config';
import { toMediaUrl } from '../utils/api-media';

/** Photos through the site's resizing, cached image proxy instead of slow signed storage URLs. */
const fast = (url?: string | null) => (url ? toMediaUrl(url) || url : url);
const withFastPhotos = (row: OwnerSubmission): OwnerSubmission => ({ ...row, photos: (row.photos ?? []).map((photo) => fast(photo)!) });

export type OwnerDealType = 'Rent' | 'Sale';
export type OwnerSubmissionStatus = 'new' | 'contacted' | 'visited' | 'approved' | 'sent' | 'published' | 'rejected';
export interface OwnerLinkInfo {
  dealType: OwnerDealType;
  agentName: string;
  agentPhoto?: string;
}
export interface OwnerSubmission {
  id: number;
  linkId: number | null;
  isGeneralSubmission?: boolean;
  approvedAt?: string;
  history?: Array<{ id: number; action: string; createdAt: string; matchedClients: number }>;
  agentUserId: string;
  agentName?: string;
  dealType: OwnerDealType;
  ownerName: string;
  ownerPhone: string;
  ownerEmail?: string;
  data: Record<string, any>;
  photos: string[];
  status: OwnerSubmissionStatus;
  verification: Record<string, boolean>;
  agentNotes?: string;
  publishedApartmentId?: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class OwnerListingService {
  private readonly submissions = signal<OwnerSubmission[]>([]);
  readonly pendingCount = computed(
    () => this.submissions().filter((item) => item.status === 'new').length,
  );
  private readonly apiUrl = `${API_URL}/owner-listings`;
  constructor(private http: HttpClient) {}
  createLink(
    dealType: OwnerDealType,
  ): Observable<{ token: string; path: string; dealType: OwnerDealType }> {
    return this.http.post<any>(`${this.apiUrl}/links`, { dealType });
  }
  getLink(token: string): Observable<OwnerLinkInfo> {
    return this.http.get<OwnerLinkInfo>(`${this.apiUrl}/links/${token}`)
      .pipe(map((info) => ({ ...info, agentPhoto: fast(info.agentPhoto) ?? undefined })));
  }
  submit(
    token: string,
    data: Record<string, any>,
    ownerName: string,
    ownerPhone: string,
    ownerEmail: string,
    photos: File[],
    requestId?: string,
  ): Observable<{ message: string }> {
    const body = new FormData();
    body.append('data', JSON.stringify(data));
    body.append('ownerName', ownerName);
    body.append('ownerPhone', ownerPhone);
    if (ownerEmail.trim()) body.append('ownerEmail', ownerEmail.trim());
    photos.forEach((photo) => body.append('photos', photo, photo.name));
    if (requestId) body.append('requestId', requestId);
    return this.http.post<{ message: string }>(token ? `${this.apiUrl}/links/${token}/submissions` : `${this.apiUrl}/submissions`, body);
  }
  getSubmissions(): Observable<OwnerSubmission[]> {
    return this.http
      .get<OwnerSubmission[]>(`${this.apiUrl}/submissions`)
      .pipe(map((rows) => rows.map(withFastPhotos)), tap((rows) => this.submissions.set(rows)));
  }
  getSubmission(id: number): Observable<OwnerSubmission> {
    return this.http.get<OwnerSubmission>(`${this.apiUrl}/submissions/${id}`).pipe(map(withFastPhotos), tap(updated =>
      this.submissions.update(rows => rows.map(row => row.id === updated.id ? updated : row))));
  }
  updateSubmission(
    id: number,
    update: { data?: Record<string, any>; ownerName?: string; ownerPhone?: string } & Partial<
      Pick<OwnerSubmission, 'status' | 'verification' | 'agentNotes' | 'publishedApartmentId'>
    >,
  ): Observable<OwnerSubmission> {
    return this.http
      .patch<OwnerSubmission>(`${this.apiUrl}/submissions/${id}`, update)
      .pipe(
        tap((updated) =>
          this.submissions.update((rows) =>
            rows.map((row) => (row.id === updated.id ? updated : row)),
          ),
        ),
      );
  }
  review(id: number, action: 'approve' | 'reject' | 'send') {
    return this.http.post<{ status: OwnerSubmissionStatus; matchedClients?: number; alreadySent?: boolean }>(`${this.apiUrl}/submissions/${id}/${action}`, {}).pipe(tap(result =>
      this.submissions.update(rows => rows.map(row => row.id === id ? { ...row, status: result.status } : row))));
  }
  matches() {
    return this.http.get<Array<{ id: number; submissionId: number; clientId: number; createdAt: string; apartmentId: number; dataJson: string }>>(`${this.apiUrl}/matches`);
  }
}
