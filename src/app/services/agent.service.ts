import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Agent } from '../models/agent';

@Injectable({
  providedIn: 'root',
})
export class AgentService {
  private readonly apiUrl = 'https://localhost:7111/api/Agents';

  constructor(private http: HttpClient) {}

  getAgents(): Observable<Agent[]> {
    return this.http.get<Agent[]>(this.apiUrl);
  }

  getAgent(agentId: string): Observable<Agent> {
    return this.http.get<Agent>(`${this.apiUrl}/${agentId}`);
  }

  rateAgent(agentId: string, rating: number): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/${agentId}/ratings`, { rating });
  }
}
