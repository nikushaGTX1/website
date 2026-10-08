import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { Agent as ApiAgent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';
import { Router } from '@angular/router';
import { whatsappDigits } from '../utils/phone';

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
  phoneNumber: string;
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
  selectedPhoneAgent: AgentCard | null = null;

  skeletonCards = [1, 2, 3, 4];

  constructor(
    private agentService: AgentService,
    private router: Router,
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

        // The site administrator account is an agent in the database but must not be listed publicly.
        this.allAgents = agents
          .filter((agent) => !/^admin(istrator)?$/i.test((agent.userName || '').trim()) && !/^admin(istrator)?$/i.test((agent.fullName || agent.name || '').trim()))
          .map((agent) => this.toAgentCard(agent));
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
    this.selectedPhoneAgent = agent;
  }

  closePhoneDialog(): void {
    this.selectedPhoneAgent = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closePhoneDialog();
  }

  /** Directory headline: the sum of the per-agent counts shown on the cards. */
  get totalClosedDeals(): number {
    return this.allAgents.reduce((total, agent) => total + agent.closedDeals, 0);
  }

  /** WhatsApp chat when the agent has a phone; otherwise their profile's contact section. */
  onMessage(agent: AgentCard): void {
    const phone = whatsappDigits(agent.phoneNumber);
    if (phone) {
      window.open(`https://wa.me/${phone}`, '_blank', 'noopener');
      return;
    }
    void this.router.navigate(['/agent-profile', agent.id]);
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
      phoneNumber: agent.phoneNumber?.trim() || '',
    };
  }
}
