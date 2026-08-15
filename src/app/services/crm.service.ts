import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateCrmActivityRequest,
  CreateCrmLeadRequest,
  CreateCrmTaskRequest,
  CrmInquiryRequest,
  CrmInquiryResponse,
  CrmLead,
  CrmLeadActivity,
  CrmLeadFilters,
  CrmLeadStatus,
  CrmMetrics,
  CrmTask,
  UpdateCrmLeadRequest,
  UpdateCrmTaskRequest,
} from '../models/crm';
import { API_URL } from '../utils/api-config';

@Injectable({ providedIn: 'root' })
export class CrmService {
  private readonly apiUrl = `${API_URL}/Crm`;

  constructor(private http: HttpClient) {}

  getLeads(filters: CrmLeadFilters = {}): Observable<CrmLead[]> {
    let params = new HttpParams();

    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.status) params = params.set('status', filters.status);
    if (filters.source?.trim()) params = params.set('source', filters.source.trim());
    if (filters.assignedAgentId?.trim()) {
      params = params.set('assignedAgentId', filters.assignedAgentId.trim());
    }

    return this.http.get<CrmLead[]>(`${this.apiUrl}/leads`, { params });
  }

  getLead(leadId: number): Observable<CrmLead> {
    return this.http.get<CrmLead>(`${this.apiUrl}/leads/${leadId}`);
  }

  getMetrics(): Observable<CrmMetrics> {
    return this.http.get<CrmMetrics>(`${this.apiUrl}/metrics`);
  }

  createLead(request: CreateCrmLeadRequest): Observable<CrmLead> {
    return this.http.post<CrmLead>(`${this.apiUrl}/leads`, request);
  }

  updateLead(leadId: number, request: UpdateCrmLeadRequest): Observable<CrmLead> {
    return this.http.put<CrmLead>(
      `${this.apiUrl}/leads/${leadId}`,
      request,
    );
  }

  updateLeadStatus(leadId: number, status: CrmLeadStatus): Observable<CrmLead> {
    return this.http.patch<CrmLead>(
      `${this.apiUrl}/leads/${leadId}/status`,
      { status },
    );
  }

  assignLead(leadId: number, assignedAgentId: string | null): Observable<CrmLead> {
    return this.http.put<CrmLead>(
      `${this.apiUrl}/leads/${leadId}/assignment`,
      { assignedAgentId },
    );
  }

  createActivity(
    leadId: number,
    request: CreateCrmActivityRequest,
  ): Observable<CrmLeadActivity> {
    return this.http.post<CrmLeadActivity>(
      `${this.apiUrl}/leads/${leadId}/activities`,
      request,
    );
  }

  createTask(leadId: number, request: CreateCrmTaskRequest): Observable<CrmTask> {
    return this.http.post<CrmTask>(
      `${this.apiUrl}/leads/${leadId}/tasks`,
      request,
    );
  }

  updateTask(
    leadId: number,
    taskId: number,
    request: UpdateCrmTaskRequest,
  ): Observable<CrmTask> {
    return this.http.patch<CrmTask>(
      `${this.apiUrl}/leads/${leadId}/tasks/${taskId}`,
      request,
    );
  }

  submitInquiry(request: CrmInquiryRequest): Observable<CrmInquiryResponse> {
    return this.http.post<CrmInquiryResponse>(`${this.apiUrl}/inquiries`, request);
  }
}
