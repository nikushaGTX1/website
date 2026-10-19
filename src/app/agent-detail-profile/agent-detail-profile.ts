import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { Agent, AgentPublicReview } from '../models/agent';
import { Apartment } from '../models/apartment';
import { CrmLead } from '../models/crm';
import { AgentService } from '../services/agent.service';
import { ApartmentService } from '../services/apartment.service';
import { CrmService } from '../services/crm.service';
import { SeoService } from '../services/seo.service';
import { TranslationService } from '../services/translation.service';
import { formatReviewDate, pick, reviewsText } from '../utils/review-i18n';
import { AGENT_LANGUAGES, languageNameList } from '../utils/agent-languages';
import { AuthService } from '../services/auth.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';
import { whatsappDigits } from '../utils/phone';
import { NgIf, NgTemplateOutlet, NgFor, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CurrencyPrice } from '../currency-price/currency-price';
import { ListingTitlePipe } from '../shared/listing-title.pipe';

@Component({
  selector: 'app-agent-detail-profile',
  templateUrl: './agent-detail-profile.html',
  styleUrl: './agent-detail-profile.css',
  imports: [
    RouterLink,
    NgIf,
    NgTemplateOutlet,
    NgFor,
    FormsModule,
    CurrencyPrice,
    DecimalPipe,
    ListingTitlePipe,
  ],
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
      this.listingFilter === 'all'
        ? true
        : this.listingFilter === 'sale'
          ? this.isForSale(apartment)
          : !this.isForSale(apartment),
    );
    if (this.listingSort === 'newest') return filtered;
    const direction = this.listingSort === 'price-asc' ? 1 : -1;
    return [...filtered].sort((a, b) => (Number(a.price) - Number(b.price)) * direction);
  }

  listingCount(filter: 'all' | 'sale' | 'rent'): number {
    if (filter === 'all') return this.listings.length;
    return this.listings.filter((apartment) => (filter === 'sale') === this.isForSale(apartment))
      .length;
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
    private translationService: TranslationService,
    private authService: AuthService,
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
            .filter(
              (apartment) =>
                apartments.fromAgentEndpoint || this.belongsToAgent(apartment, agent, agentId),
            )
            .sort(
              (left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''),
            );
          this.crmWonDeals =
            wonLeads === null
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

  showAllReviews = false;

  /** Real client reviews, newest first: those with a comment come first. */
  get reviews(): AgentPublicReview[] {
    const all = this.agent?.ratings ?? [];
    return [
      ...all.filter((review) => review.comment?.trim()),
      ...all.filter((review) => !review.comment?.trim()),
    ];
  }

  get visibleReviews(): AgentPublicReview[] {
    return this.showAllReviews ? this.reviews : this.reviews.slice(0, 6);
  }

  /** Review-section copy in the visitor's language (the section opts out of the page translator). */
  rt(en: string, ka: string, ru: string): string {
    return pick(this.translationService.language$.value, en, ka, ru);
  }

  get reviewCountText(): string {
    return reviewsText(
      this.translationService.language$.value,
      this.agent?.ratingCount || this.reviews.length,
    );
  }

  readonly allLanguages = AGENT_LANGUAGES;
  languageEditorOpen = false;
  languageDraft = new Set<string>();
  languageSaving = false;
  languageError = '';

  /** "Georgian, English, Russian" in the visitor's language. */
  get languageNames(): string {
    return languageNameList(this.agent?.languages, this.translationService.language$.value);
  }

  /** Only admins and managers may change an agent's languages (the API enforces the same). */
  get canEditLanguages(): boolean {
    return this.authService.isCrmManager && !!this.agent?.id;
  }

  languageLabel(language: (typeof AGENT_LANGUAGES)[number]): string {
    return language[this.translationService.language$.value];
  }

  openLanguageEditor(): void {
    this.languageDraft = new Set(
      this.agent?.languages?.length ? this.agent.languages : ['ka', 'en', 'ru'],
    );
    this.languageError = '';
    this.languageEditorOpen = true;
  }

  closeLanguageEditor(): void {
    this.languageEditorOpen = false;
    this.languageError = '';
  }

  toggleLanguage(code: string): void {
    const next = new Set(this.languageDraft);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    this.languageDraft = next;
  }

  saveLanguages(): void {
    const agentId = this.agent?.id;
    if (!agentId || !this.languageDraft.size || this.languageSaving) return;
    this.languageSaving = true;
    this.languageError = '';
    // Send in display order; the API stores them in the same order.
    const codes = AGENT_LANGUAGES.map((language) => language.code).filter((code) =>
      this.languageDraft.has(code),
    );
    this.agentService.setLanguages(agentId, codes).subscribe({
      next: ({ languages }) => {
        if (this.agent) this.agent = { ...this.agent, languages };
        this.languageSaving = false;
        this.languageEditorOpen = false;
        this.cdr.detectChanges();
      },
      error: (error: { status?: number }) => {
        this.languageSaving = false;
        this.languageError =
          error.status === 403 || error.status === 401
            ? this.rt(
                'Only admins and managers can change languages.',
                'ენების შეცვლა მხოლოდ ადმინისტრატორს და მენეჯერს შეუძლია.',
                'Менять языки могут только администраторы и менеджеры.',
              )
            : this.rt(
                'Languages could not be saved. Please try again.',
                'ენების შენახვა ვერ მოხერხდა. სცადეთ ხელახლა.',
                'Не удалось сохранить языки. Попробуйте снова.',
              );
        this.cdr.detectChanges();
      },
    });
  }

  reviewMonth(review: AgentPublicReview): string {
    return formatReviewDate(this.translationService.language$.value, review.createdAt, {
      year: 'numeric',
      month: 'short',
    });
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
    const phone = whatsappDigits(this.contactPhone);
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
      ((!!assignedId && agentIds.includes(assignedId)) ||
        (!!assignedName && agentNames.includes(assignedName)))
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
