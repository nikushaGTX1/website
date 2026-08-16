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
}
