import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateCrmActivityRequest,
  CreateCrmLeadRequest,
  CreateCrmTaskRequest,
  CrmInquiryRequest,
  CrmInquiryResponse,
  CrmJobApplication,
  CrmVacancyPosition,
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

  getJobApplications(): Observable<CrmJobApplication[]> {
    return this.http.get<CrmJobApplication[]>(`${this.apiUrl}/job-applications`);
  }

  downloadJobApplicationCv(applicationId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/job-applications/${applicationId}/cv`, {
      responseType: 'blob',
    });
  }

  confirmJobApplication(applicationId: number): Observable<CrmJobApplication> {
    return this.http.patch<CrmJobApplication>(
      `${this.apiUrl}/job-applications/${applicationId}/confirm`,
      {},
    );
  }

  deleteJobApplication(applicationId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/job-applications/${applicationId}`);
  }

  getVacancyPositions(includeInactive = false): Observable<CrmVacancyPosition[]> {
    const suffix = includeInactive ? '/all' : '';
    return this.http.get<CrmVacancyPosition[]>(`${this.apiUrl}/vacancy-positions${suffix}`);
  }

  createVacancyPosition(title: string): Observable<CrmVacancyPosition> {
    return this.http.post<CrmVacancyPosition>(`${this.apiUrl}/vacancy-positions`, { title });
  }

  deleteVacancyPosition(positionId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/vacancy-positions/${positionId}`);
  }

  generateQuestionnaireLink(): Observable<{ token: string; slug: string; path: string }> {
    return this.http.post<{ token: string; slug: string; path: string }>(
      `${this.apiUrl}/questionnaire-links`,
      {},
    );
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

  deleteLead(leadId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/leads/${leadId}`);
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
