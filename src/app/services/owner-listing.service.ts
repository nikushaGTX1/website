import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../utils/api-config';

export type OwnerDealType = 'Rent' | 'Sale';
export type OwnerSubmissionStatus = 'new' | 'contacted' | 'visited' | 'published' | 'rejected';
export interface OwnerLinkInfo { dealType: OwnerDealType; agentName: string; agentPhoto?: string; }
export interface OwnerSubmission {
  id: number; linkId: number; agentUserId: string; agentName?: string; dealType: OwnerDealType;
  ownerName: string; ownerPhone: string; ownerEmail?: string; data: Record<string, any>;
  photos: string[]; status: OwnerSubmissionStatus; verification: Record<string, boolean>;
  agentNotes?: string; publishedApartmentId?: number; createdAt: string; updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class OwnerListingService {
  private readonly apiUrl = `${API_URL}/owner-listings`;
  constructor(private http: HttpClient) {}
  createLink(dealType: OwnerDealType): Observable<{ token: string; path: string; dealType: OwnerDealType }> {
    return this.http.post<any>(`${this.apiUrl}/links`, { dealType });
  }
  getLink(token: string): Observable<OwnerLinkInfo> { return this.http.get<OwnerLinkInfo>(`${this.apiUrl}/links/${token}`); }
  submit(token: string, data: Record<string, any>, ownerName: string, ownerPhone: string, ownerEmail: string, photos: File[]): Observable<{ message: string }> {
    const body = new FormData(); body.append('data', JSON.stringify(data)); body.append('ownerName', ownerName); body.append('ownerPhone', ownerPhone);
    if (ownerEmail.trim()) body.append('ownerEmail', ownerEmail.trim());
    photos.forEach(photo => body.append('photos', photo, photo.name));
    return this.http.post<{ message: string }>(`${this.apiUrl}/links/${token}/submissions`, body);
  }
  getSubmissions(): Observable<OwnerSubmission[]> { return this.http.get<OwnerSubmission[]>(`${this.apiUrl}/submissions`); }
  getSubmission(id: number): Observable<OwnerSubmission> { return this.http.get<OwnerSubmission>(`${this.apiUrl}/submissions/${id}`); }
  updateSubmission(id: number, update: Partial<Pick<OwnerSubmission, 'status' | 'verification' | 'agentNotes' | 'publishedApartmentId'>>): Observable<OwnerSubmission> {
    return this.http.patch<OwnerSubmission>(`${this.apiUrl}/submissions/${id}`, update);
  }
}
