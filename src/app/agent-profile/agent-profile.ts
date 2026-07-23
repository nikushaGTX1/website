import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Agent as ApiAgent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';

export interface AgentCard {
  id: string | number;
  name: string;
  role: string;
  location: string;
  closedDeals: number;
  rating: number;
  ratingCount: number;
  avatarUrl: string;
  bio: string;
}

@Component({
  selector: 'app-agent-profile',
  standalone: false,
  templateUrl: './agent-profile.html',
  styleUrl: './agent-profile.css',
})
export class AgentProfile implements OnInit {
  agents: AgentCard[] = [];
  allAgents: AgentCard[] = [];

  isLoading = true;
  errorMessage = '';

  searchQuery = '';
  selectedSort = 'name-az';

  skeletonCards = [1, 2, 3, 4];

  constructor(
    private agentService: AgentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadAgents();
  }

  loadAgents(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.agentService.getAgents().subscribe({
      next: (agents) => {
        console.log('Agents loaded:', agents);

        this.allAgents = agents.map((agent) => this.toAgentCard(agent));
        this.onFilterChange();

        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Agents API error:', err);

        this.allAgents = [];
        this.agents = [];
        this.isLoading = false;
        this.errorMessage = 'Could not load agents right now.';

        this.cdr.detectChanges();
      },
    });
  }

  onFilterChange(): void {
    const query = this.searchQuery.trim().toLowerCase();

    const filtered = this.allAgents.filter((agent) => {
      return (
        agent.name.toLowerCase().includes(query) ||
        agent.location.toLowerCase().includes(query) ||
        agent.bio.toLowerCase().includes(query)
      );
    });

    this.agents = [...filtered].sort((a, b) => {
      switch (this.selectedSort) {
        case 'name-za':
          return b.name.localeCompare(a.name);
        case 'deals-high':
          return b.closedDeals - a.closedDeals;
        case 'rating-high':
          return b.rating - a.rating;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    this.cdr.detectChanges();
  }

  onCall(agent: AgentCard): void {
    console.log(`Calling ${agent.name}`);
  }

  onMessage(agent: AgentCard): void {
    console.log(`Messaging ${agent.name}`);
  }

  fixAgentImage(event: Event): void {
    tryNextProfileImageUrl(event);
  }

  private toAgentCard(agent: ApiAgent): AgentCard {
    return {
      id: agent.id || agent.userId || agent.email || agent.userName || '',
      name: agent.fullName || agent.name || agent.userName || 'Agent',
      role: 'Real Estate Professional',
      location: agent.location || agent.email || 'Verified agent',
      closedDeals: agent.closedDeals || 0,
      rating: agent.averageRating || agent.rating || 0,
      ratingCount: agent.ratingCount || 0,
      avatarUrl: toMediaUrl(agent.profilePictureUrl || agent.profilePicture || agent.avatarUrl) || '/agent1.jpg',
      bio: agent.bio || 'Verified real estate agent ready to help with apartments and property questions.',
    };
  }
}
