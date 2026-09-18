import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_URL } from '../utils/api-config';

export interface AiPriceEstimateRequest {
  RealEstateType: string;
  DealType: string;
  Condition: string;
  Area: number;
  Rooms: number | null;
  Bedrooms: number | null;
  Bathrooms: number | null;
  Floor: number | null;
  TotalFloors: number | null;
  District: string;
  Street: string;
}

export interface AiPriceEstimateResult {
  price: number;
  currency: string;
}

/**
 * A response shape isn't verified against a live backend implementation —
 * this endpoint didn't exist before (see upload-apartament's AI Price
 * Calculation feature). Accepts a few plausible field names so it degrades
 * gracefully if the backend's actual contract differs slightly.
 */
interface AiPriceEstimateApiResponse {
  price?: number;
  Price?: number;
  estimatedPrice?: number;
  EstimatedPrice?: number;
  currency?: string;
  Currency?: string;
}

@Injectable({ providedIn: 'root' })
export class AiPricingService {
  private readonly apiUrl = `${API_URL}/ai-pricing/estimate`;

  constructor(private http: HttpClient) {}

  estimate(request: AiPriceEstimateRequest): Observable<AiPriceEstimateResult> {
    return this.http.post<AiPriceEstimateApiResponse>(this.apiUrl, request).pipe(
      map((response) => {
        const price = response.price ?? response.Price ?? response.estimatedPrice ?? response.EstimatedPrice;
        if (price == null || !Number.isFinite(price)) {
          throw new Error('The AI pricing service returned an unexpected response.');
        }
        return { price, currency: response.currency ?? response.Currency ?? 'USD' };
      }),
    );
  }
}
