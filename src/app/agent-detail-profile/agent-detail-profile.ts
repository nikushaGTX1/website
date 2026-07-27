import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Agent } from '../models/agent';
import { Apartment } from '../models/apartment';
import { AgentService } from '../services/agent.service';
import { ApartmentService } from '../services/apartment.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';

@Component({
  selector: 'app-agent-detail-profile',
  standalone: false,
  templateUrl: './agent-detail-profile.html',
  styleUrl: './agent-detail-profile.css',
})
export class AgentDetailProfile implements OnInit {
  agent: Agent | null = null;
  listings: Apartment[] = [];
  loading = true;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private agentService: AgentService,
    private apartmentService: ApartmentService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const agentId = this.route.snapshot.paramMap.get('id') || '';
    if (!agentId) {
      void this.router.navigate(['/agent-profile']);
      return;
    }

    forkJoin({
      agent: this.agentService.getAgent(agentId),
      apartments: this.apartmentService.getApartments(),
    }).subscribe({
      next: ({ agent, apartments }) => {
        this.agent = agent;
        this.listings = apartments.filter((apartment) => this.belongsToAgent(apartment, agentId)).slice(0, 3);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Agent profile API error:', error);
        this.errorMessage = 'Could not load this agent profile.';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  get name(): string {
    return this.agent?.fullName || this.agent?.name || this.agent?.userName || 'Verified Agent';
  }

  get photo(): string {
    return toMediaUrl(
      this.agent?.profilePictureUrl || this.agent?.profilePicture || this.agent?.avatarUrl,
    ) || '/agent1.jpg';
  }

  get bio(): string {
    return this.agent?.bio?.trim() ||
      `${this.name} is a verified real estate professional dedicated to helping clients find the right property in Tbilisi.`;
  }

  get rating(): number {
    return this.agent?.averageRating || this.agent?.rating || 0;
  }

  get location(): string {
    return this.agent?.location || 'Tbilisi, Georgia';
  }

  get yearsExperience(): number {
    return Math.max(1, Math.round((this.agent?.closedDeals || this.listings.length * 4) / 12) || 1);
  }

  get closedDeals(): number {
    return this.agent?.closedDeals || this.listings.length;
  }

  callAgent(): void {
    if (this.agent?.phoneNumber) location.href = `tel:${this.agent.phoneNumber}`;
  }

  whatsappAgent(): void {
    const phone = this.agent?.phoneNumber?.replace(/\D/g, '') || '';
    window.open(`https://wa.me/${phone}`, '_blank', 'noopener');
  }

  fixImage(event: Event): void {
    tryNextProfileImageUrl(event);
  }

  getListingImage(apartment: Apartment): string {
    return toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) || '/property-placeholder.svg';
  }

  private belongsToAgent(apartment: Apartment, agentId: string): boolean {
    return [
      apartment.agentId,
      apartment.agentUserId,
      apartment.userId,
      apartment.ownerId,
      apartment.createdById,
      apartment.applicationUserId,
      apartment.uploadedById,
    ].some((id) => String(id || '').toLowerCase() === agentId.toLowerCase());
  }
}
