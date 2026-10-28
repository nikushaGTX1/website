import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../utils/api-config';

export type ImageJobStatus =
  | 'Pending'
  | 'Running'
  | 'NoWatermark'
  | 'NeedsCleanOriginal'
  | 'DetectedOnly'
  | 'AwaitingApproval'
  | 'Approved'
  | 'Rejected'
  | 'Failed';

export type ImageAuthorizationBasis = 'Unknown' | 'Owned' | 'Licensed';

export interface ImageAiBudget {
  enabled: boolean;
  imagesProcessed: number;
  monthlyImageQuota: number;
  gpuSeconds: number;
  spentUsd: number;
  projectedUsd: number;
  budgetCutoffUsd: number;
  monthlyBudgetUsd: number;
  exhausted: boolean;
}

export interface ImageAiStatus {
  budget: ImageAiBudget;
  counts: Partial<Record<ImageJobStatus, number>>;
}

export interface ImageAiJob {
  id: number;
  apartmentId: number | null;
  apartmentImageId: number | null;
  status: ImageJobStatus;
  mode: 'detect' | 'process';
  authorizationBasis: ImageAuthorizationBasis;
  classification: string | null;
  watermarkText: string | null;
  duplicateOfJobId: number | null;
  attempts: number;
  lastError: string | null;
  gpuSeconds: number;
  estimatedCostUsd: number;
  createdAt: string;
  completedAt: string | null;
  cleanOriginalRequestedAt: string | null;
  originalUrl: string | null;
  processedUrl: string | null;
}

export interface ImageAiEnqueueRequest {
  apartmentId: number;
  mode: 'detect' | 'process';
  authorizationBasis: ImageAuthorizationBasis;
  permissionReference?: string;
}

@Injectable({ providedIn: 'root' })
export class ImageAiService {
  private readonly baseUrl = `${API_URL}/image-processing`;

  constructor(private http: HttpClient) {}

  status(): Observable<ImageAiStatus> {
    return this.http.get<ImageAiStatus>(`${this.baseUrl}/status`);
  }

  jobs(status: ImageJobStatus | '' = '', page = 1): Observable<ImageAiJob[]> {
    let params = new HttpParams().set('page', page).set('pageSize', 25);
    if (status) params = params.set('status', status);
    return this.http.get<ImageAiJob[]>(`${this.baseUrl}/jobs`, { params });
  }

  enqueue(request: ImageAiEnqueueRequest): Observable<{ queued: number; jobIds: number[] }> {
    return this.http.post<{ queued: number; jobIds: number[] }>(`${this.baseUrl}/jobs`, request);
  }

  action(
    id: number,
    action: 'approve' | 'reject' | 'revert' | 'retry' | 'clean-original-requested',
  ): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/jobs/${id}/${action}`, {});
  }
}
