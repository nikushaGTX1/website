import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { Agent } from '../models/agent';
import { Apartment } from '../models/apartment';
import { CrmLead } from '../models/crm';
import { AgentService } from '../services/agent.service';
import { ApartmentService } from '../services/apartment.service';
import { CrmService } from '../services/crm.service';
import { SeoService } from '../services/seo.service';
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
  phoneDialogOpen = false;
  private crmWonDeals: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private agentService: AgentService,
    private apartmentService: ApartmentService,
    private crmService: CrmService,
    private seoService: SeoService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const agentId = this.route.snapshot.paramMap.get('id') || '';
    if (!agentId) {
      void this.router.navigate(['/agent-profile']);
      return;
    }

    this.agentService
      .getAgent(agentId)
      .pipe(
        switchMap((agent) => {
          const crmAgentId = agent.userId || agent.id || agentId;
          return forkJoin({
            agent: of(agent),
            apartments: this.apartmentService.getApartments(),
            wonLeads: this.crmService
              .getLeads({ status: 'won', assignedAgentId: crmAgentId })
              .pipe(catchError(() => of(null as CrmLead[] | null))),
          });
        }),
      )
      .subscribe({
      next: ({ agent, apartments, wonLeads }) => {
        this.agent = agent;
        this.seoService.updateAgent(agent);
        this.listings = apartments
          .filter((apartment) => this.belongsToAgent(apartment, agent, agentId))
          .sort(
            (left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''),
          );
        this.crmWonDeals = wonLeads === null
          ? null
          : wonLeads.filter((lead) => this.belongsToAgentCrm(lead, agent, agentId)).length;
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
    return (
      toMediaUrl(
        this.agent?.profilePictureUrl || this.agent?.profilePicture || this.agent?.avatarUrl,
      ) || '/agent1.jpg'
    );
  }

  get bio(): string {
    return (
      this.agent?.bio?.trim() ||
      `${this.name} is a verified real estate professional dedicated to helping clients find the right property in Tbilisi.`
    );
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
    return this.crmWonDeals ?? this.agent?.closedDeals ?? this.listings.length;
  }

  get contactPhone(): string {
    return (
      this.agent?.phoneNumber?.trim() ||
      this.listings.find((listing) => listing.phoneNumber?.trim())?.phoneNumber?.trim() ||
      this.listings.map((listing) => this.getListingMetadata(listing, 'Phone')).find(Boolean) ||
      ''
    );
  }

  callAgent(): void {
    this.phoneDialogOpen = true;
  }

  closePhoneDialog(): void {
    this.phoneDialogOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closePhoneDialog();
  }

  whatsappAgent(): void {
    const phone = this.contactPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}`, '_blank', 'noopener');
  }

  fixImage(event: Event): void {
    tryNextProfileImageUrl(event);
  }

  getListingImage(apartment: Apartment): string {
    return (
      toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) || '/property-placeholder.svg'
    );
  }

  private belongsToAgent(apartment: Apartment, agent: Agent, routeAgentId: string): boolean {
    const agentIds = [routeAgentId, agent.id, agent.userId]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase());
    const agentEmails = [agent.email]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase());
    const agentNames = [agent.fullName, agent.name, agent.userName]
      .filter((value): value is string => !!value)
      .map((value) => value.trim().toLowerCase());
    const apartmentIds = [
      apartment.agentId,
      apartment.agentUserId,
      apartment.userId,
      apartment.ownerId,
      apartment.createdById,
      apartment.applicationUserId,
      apartment.uploadedById,
      this.getListingMetadata(apartment, 'Owner ID'),
    ]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase());
    const apartmentEmails = [
      apartment.agentEmail,
      apartment.userEmail,
      apartment.createdByEmail,
      apartment.uploadedByEmail,
      this.getListingMetadata(apartment, 'Owner Email'),
    ]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase());
    const apartmentNames = [apartment.agentName, apartment.uploadedByName, apartment.ownerName]
      .filter((value): value is string => !!value)
      .map((value) => value.trim().toLowerCase());

    return (
      apartmentIds.some((value) => agentIds.includes(value)) ||
      apartmentEmails.some((value) => agentEmails.includes(value)) ||
      apartmentNames.some((value) => agentNames.includes(value))
    );
  }

  private belongsToAgentCrm(lead: CrmLead, agent: Agent, routeAgentId: string): boolean {
    const agentIds = [routeAgentId, agent.id, agent.userId]
      .filter((value): value is string => !!value)
      .map((value) => value.trim().toLowerCase());
    const agentNames = [agent.fullName, agent.name, agent.userName]
      .filter((value): value is string => !!value)
      .map((value) => value.trim().toLowerCase());
    const assignedId = lead.assignedAgentId?.trim().toLowerCase();
    const assignedName = lead.assignedAgentName?.trim().toLowerCase();

    return (
      lead.status === 'won' &&
      (!!assignedId && agentIds.includes(assignedId) ||
        !!assignedName && agentNames.includes(assignedName))
    );
  }

  private getListingMetadata(apartment: Apartment, label: string): string {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (
      apartment.description
        ?.match(new RegExp(`(?:^|\\|)\\s*${escapedLabel}:\\s*([^|\\r\\n]+)`, 'i'))?.[1]
        ?.trim() || ''
    );
  }
}
