import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../utils/api-config';

export type OfferStatus = 'pending' | 'approved' | 'rejected';

export interface ApartmentOfferReview {
  id: number;
  clientId: number;
  status: OfferStatus;
  shareWithOtherClients: boolean;
  createdAt: string;
  reviewedAt: string | null;
  isNew: boolean;
  submitter: { name: string | null; phone: string | null };
  matchedClientIds: number[];
  apartment: {
    id: number;
    title: string;
    price: number;
    district: string;
    street: string;
    bedrooms: number;
    sizeSquareMeters: number;
    isApproved: boolean;
    imageUrl: string | null;
  };
}

export interface ApartmentOfferMatchItem {
  id: number;
  apartmentOfferId: number;
  clientId: number;
  createdAt: string;
  apartment: Omit<ApartmentOfferReview['apartment'], 'imageUrl'>;
}

@Injectable({ providedIn: 'root' })
export class ApartmentOfferService {
  private url = `${API_URL}/apartment-offers`;
  constructor(private http: HttpClient) {}

  submit(clientId: number, apartmentId: number, shareWithOtherClients: boolean) {
    return this.http.post<{ id: number; status: OfferStatus }>(this.url, { clientId, apartmentId, shareWithOtherClients });
  }
  reviews(status: OfferStatus) {
    return this.http.get<ApartmentOfferReview[]>(this.url, { params: { status } });
  }
  matches() {
    return this.http.get<ApartmentOfferMatchItem[]>(`${this.url}/matches`);
  }
  approve(id: number) {
    return this.http.post<{ status: OfferStatus; matchedClients: number }>(`${this.url}/${id}/approve`, {});
  }
  reject(id: number) {
    return this.http.post<{ status: OfferStatus; matchedClients: number }>(`${this.url}/${id}/reject`, {});
  }
}
