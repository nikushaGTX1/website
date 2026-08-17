import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Agent } from '../models/agent';
import { User } from '../models/user';
import { API_URL } from '../utils/api-config';

export interface AdminUserSettings {
  fullName: string;
  userName: string;
  email: string;
  phoneNumber: string;
  bio: string;
  profilePicture?: File | null;
}

export interface AdminStreetSummary {
  id: number;
  nameKa: string;
  nameEn: string;
  aliases: string[];
  cityId: number;
  districtId: number;
  district: string;
  source: string;
  externalSourceId: string;
  geometryStatus: 'geometry_missing' | 'pending_review' | 'approved' | 'rejected';
  hasGeometry: boolean;
  reviewNotes?: string;
}

export interface AdminStreetDetail extends AdminStreetSummary {
  geometry: { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] };
  bounds?: { type: 'Polygon'; coordinates: number[][][] };
  centroid?: { lat: number; lng: number };
}

export interface AdminStreetImportResult {
  districtId: number;
  district: string;
  candidateCount: number;
  createdCount: number;
  updatedCount: number;
  missingNameCount: number;
}

export interface AdminAreaDetail {
  id: number;
  nameKa: string;
  nameEn: string;
  source: string;
  externalSourceId: string;
  geometryStatus: string;
  geometry?: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

export interface BulkGeometryApprovalResult {
  approvedDistricts: number;
  approvedStreets: number;
  skippedDistricts: Array<{ id: number; nameEn: string; reason: string }>;
  skippedStreets: Array<{ id: number; nameEn: string; reason: string }>;
}

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly adminUrl = `${API_URL}/Admin`;
  private readonly agentsUrl = `${API_URL}/Agents`;

  constructor(private http: HttpClient) {}

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.adminUrl}/users`);
  }

  getUserIds(): Observable<string[]> {
    return this.http.get<string[]>(`${this.adminUrl}/user-ids`);
  }

  getUser(id: string): Observable<User> {
    return this.http.get<User>(`${this.adminUrl}/users/${id}`);
  }

  updateUser(id: string, settings: AdminUserSettings): Observable<unknown> {
    const formData = new FormData();
    formData.append('FullName', settings.fullName);
    formData.append('UserName', settings.userName);
    formData.append('Email', settings.email);
    formData.append('PhoneNumber', settings.phoneNumber);
    formData.append('Bio', settings.bio);

    if (settings.profilePicture) {
      formData.append('ProfilePicture', settings.profilePicture);
    }

    return this.http.put(`${this.adminUrl}/users/${id}/settings`, formData);
  }

  resetUserPassword(id: string, newPassword: string): Observable<unknown> {
    return this.http.put(`${this.adminUrl}/users/${id}/password`, { newPassword });
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.adminUrl}/users/${id}`);
  }

  makeAgent(userId: string): Observable<unknown> {
    return this.http.post(`${this.adminUrl}/make-agent/${userId}`, {});
  }

  removeAgent(userId: string): Observable<unknown> {
    return this.http.post(`${this.adminUrl}/remove-agent/${userId}`, {});
  }

  setCrmRole(userId: string, role: string): Observable<unknown> {
    return this.http.put(`${this.adminUrl}/users/${userId}/crm-role`, { role });
  }

  getAgents(): Observable<Agent[]> {
    return this.http.get<Agent[]>(this.agentsUrl);
  }

  getAgent(agentId: string): Observable<Agent> {
    return this.http.get<Agent>(`${this.agentsUrl}/${agentId}`);
  }

  rateAgent(agentId: string, rating: number): Observable<unknown> {
    return this.http.post(`${this.agentsUrl}/${agentId}/ratings`, { rating });
  }

  getStreets(status = 'pending_review', search = ''): Observable<AdminStreetSummary[]> {
    return this.http.get<AdminStreetSummary[]>(`${this.adminUrl}/streets`, {
      params: { status, ...(search.trim() ? { search: search.trim() } : {}) },
    });
  }

  getStreet(id: number): Observable<AdminStreetDetail> {
    return this.http.get<AdminStreetDetail>(`${this.adminUrl}/streets/${id}`);
  }

  importDistrictStreets(district: string): Observable<AdminStreetImportResult> {
    return this.http.post<AdminStreetImportResult>(`${this.adminUrl}/streets/import/${encodeURIComponent(district)}`, {});
  }

  getReviewArea(id: number): Observable<AdminAreaDetail> {
    return this.http.get<AdminAreaDetail>(`${this.adminUrl}/streets/areas/${id}`);
  }

  approveReviewArea(id: number): Observable<unknown> {
    return this.http.post(`${this.adminUrl}/streets/areas/${id}/approve`, {});
  }

  approveAllVerifiedGeometry(): Observable<BulkGeometryApprovalResult> {
    return this.http.post<BulkGeometryApprovalResult>(`${this.adminUrl}/streets/approve-all-verified`, {});
  }

  approveStreet(id: number, notes = '', allowOutsideDistrict = false): Observable<unknown> {
    return this.http.post(`${this.adminUrl}/streets/${id}/approve`, { notes, allowOutsideDistrict });
  }

  rejectStreet(id: number, notes = ''): Observable<unknown> {
    return this.http.post(`${this.adminUrl}/streets/${id}/reject`, { notes });
  }

  replaceStreetGeometry(id: number, payload: {
    geometry: unknown;
    source: string;
    externalSourceId: string;
    nameKa?: string;
    nameEn?: string;
    aliases?: string[];
    notes?: string;
  }): Observable<AdminStreetDetail> {
    return this.http.put<AdminStreetDetail>(`${this.adminUrl}/streets/${id}/geometry`, payload);
  }

  getStreetAudit(): Observable<any> {
    return this.http.get(`${this.adminUrl}/streets/audit`);
  }
}
