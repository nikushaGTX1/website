import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Agent } from '../models/agent';
import { User } from '../models/user';
import { API_URL } from '../utils/api-config';

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

  makeAgent(userId: string): Observable<unknown> {
    return this.http.post(`${this.adminUrl}/make-agent/${userId}`, {});
  }

  removeAgent(userId: string): Observable<unknown> {
    return this.http.post(`${this.adminUrl}/remove-agent/${userId}`, {});
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
