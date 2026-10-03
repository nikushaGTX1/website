import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
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
  listingFilter: 'all' | 'sale' | 'rent' = 'all';
  listingSort: 'newest' | 'price-asc' | 'price-desc' = 'newest';
  readonly listingFilters: Array<{ value: 'all' | 'sale' | 'rent'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'sale', label: 'For Sale' },
    { value: 'rent', label: 'For Rent' },
  ];

  /** First 3 on the profile; every listing (filtered + sorted) on the all-properties page. */
  get visibleListings(): Apartment[] {
    if (!this.listingsPage) return this.listings.slice(0, 3);
    const filtered = this.listings.filter((apartment) =>
      this.listingFilter === 'all' ? true : this.listingFilter === 'sale' ? this.isForSale(apartment) : !this.isForSale(apartment),
    );
    if (this.listingSort === 'newest') return filtered;
    const direction = this.listingSort === 'price-asc' ? 1 : -1;
    return [...filtered].sort((a, b) => (Number(a.price) - Number(b.price)) * direction);
  }

  listingCount(filter: 'all' | 'sale' | 'rent'): number {
    if (filter === 'all') return this.listings.length;
    return this.listings.filter((apartment) => (filter === 'sale') === this.isForSale(apartment)).length;
  }

  /** True on /agent-profile/:id/listings (the dedicated all-properties page). */
  get listingsPage(): boolean {
    return !!this.route.snapshot.data['listingsPage'];
  }

  get agentRouteId(): string {
    return this.route.snapshot.paramMap.get('id') || '';
  }
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
          // Ask the API for this account's uploads; fall back to the old name/ID matching
          // over the public list if the endpoint is unavailable.
          const publicList$ = this.apartmentService
            .getApartments()
            .pipe(map((list) => ({ list, fromAgentEndpoint: false })));
          const accountId = agent.userId || agent.id;
          const apartments$ = accountId
            ? this.apartmentService.getAgentApartments(accountId).pipe(
                map((list) => ({ list, fromAgentEndpoint: true })),
                catchError(() => publicList$),
              )
            : publicList$;
          return forkJoin({
            agent: of(agent),
            apartments: apartments$,
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
        // The by-agent endpoint already filters by uploader; only the public fallback needs matching.
        this.listings = apartments.list
          .filter((apartment) => apartments.fromAgentEndpoint || this.belongsToAgent(apartment, agent, agentId))
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
    return this.agent?.location || 'Tbilisi';
  }

  get yearsExperience(): number {
    return Math.max(1, Math.round((this.agent?.closedDeals || this.listings.length * 4) / 12) || 1);
  }

  get closedDeals(): number {
    return this.agent?.closedDeals ?? this.crmWonDeals ?? this.listings.length;
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

  /** Same deal-type signal the listing card and detail page use: a "Deal: ..." tag in the
   * description, falling back to the title/description text. The badge was previously
   * hardcoded to "For Rent" regardless of the listing. */
  isForSale(apartment: Apartment): boolean {
    const dealTag = /deal:\s*([^|\n]+)/i.exec(apartment.description || '')?.[1]?.trim();
    if (dealTag) return /sale|buy|იყიდება|продаж/i.test(dealTag);
    const text = `${apartment.title || ''} ${apartment.description || ''}`;
    return /for\s+sale|იყიდება|продаж/i.test(text);
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
      apartment.uploadedByUserId,
      apartment.uploaderUserId,
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
    // ownerName is the property owner (landlord), never the agent, so it is not matched.
    const apartmentNames = [apartment.agentName, apartment.uploadedByName]
      .filter((value): value is string => !!value)
      .map((value) => value.trim().toLowerCase());

    // A listing with a known uploader belongs to that account only; names are a
    // fallback for old imports that have no uploader ID or email.
    if (apartmentIds.length || apartmentEmails.length) {
      return (
        apartmentIds.some((value) => agentIds.includes(value)) ||
        apartmentEmails.some((value) => agentEmails.includes(value))
      );
    }
    return apartmentNames.some((value) => agentNames.includes(value));
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
