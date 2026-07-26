import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { ApartmentService } from '../services/apartment.service';
import { Apartment } from '../models/apartment';
import { Agent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';
import { Router } from '@angular/router';

@Component({
  selector: 'app-main',
  standalone: false,
  templateUrl: './main.html',
  styleUrl: './main.css',
})
export class Main implements OnInit {
  apartments: Apartment[] = [];
  agents: Agent[] = [];
  loading = true;
  agentsLoading = true;
  searchMode: 'rent' | 'buy' = 'rent';
  searchLocation = '';
  searchBudget = '';
  budgetOpen = false;
  bedroomOpen = false;
  budgetCurrency: 'GEL' | 'USD' = 'GEL';
  budgetMin: number | null = 0;
  budgetMax: number | null = 5000;
  appliedBudgetMin: number | null = null;
  appliedBudgetMax: number | null = null;
  selectedBudgetRange = '';
  readonly budgetRanges = [
    { label: 'Up to $800', min: 0, max: 800 },
    { label: '$800 – $1,500', min: 800, max: 1500 },
    { label: '$1,500 – $3,000', min: 1500, max: 3000 },
    { label: '$3,000 – $5,000', min: 3000, max: 5000 },
  ];
  readonly bedroomOptions = [
    { label: 'Studio', value: '0', icon: '♙' },
    { label: '1 Bed', value: '1', icon: '▱' },
    { label: '2 Beds', value: '2', icon: '♙' },
    { label: '3 Beds', value: '3', icon: '▱' },
    { label: '4 Beds', value: '4', icon: '♙' },
    { label: '4+ Beds', value: '4+', icon: '▦' },
  ];
  searchBedrooms = '';
  searchMoveIn = '';
  public advancedFiltersOpen = false;

  constructor(
    private apartmentService: ApartmentService,
    private agentService: AgentService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadApartments();
    this.loadAgents();
  }

  get budgetSummary(): string {
    const min = this.appliedBudgetMin;
    const max = this.appliedBudgetMax;
    if (min == null && max == null) return 'Any budget';
    if (min != null && max != null) return `${min.toLocaleString()} – ${max.toLocaleString()} ${this.budgetCurrency}`;
    if (min != null) return `${min.toLocaleString()}+ ${this.budgetCurrency}`;
    return `Up to ${max!.toLocaleString()} ${this.budgetCurrency}`;
  }

  get bedroomSummary(): string {
    return this.bedroomOptions.find((option) => option.value === this.searchBedrooms)?.label || 'Any';
  }

  @HostListener('document:click')
  closeBudget(): void {
    this.budgetOpen = false;
    this.bedroomOpen = false;
  }

  selectBudgetRange(range: { label: string; min: number; max: number }): void {
    this.selectedBudgetRange = range.label;
    this.budgetCurrency = 'USD';
    this.budgetMin = range.min;
    this.budgetMax = range.max;
  }

  applyBudget(): void {
    this.appliedBudgetMin = this.normalizeBudget(this.budgetMin);
    this.appliedBudgetMax = this.normalizeBudget(this.budgetMax);
    this.searchBudget = this.appliedBudgetMax?.toString() || '';
    this.budgetOpen = false;
  }

  resetBudget(): void {
    this.budgetMin = 0;
    this.budgetMax = 5000;
    this.appliedBudgetMin = null;
    this.appliedBudgetMax = null;
    this.searchBudget = '';
    this.selectedBudgetRange = '';
    this.budgetOpen = false;
  }

  selectBedrooms(value: string): void {
    this.searchBedrooms = value;
    this.bedroomOpen = false;
  }

  clearBedrooms(): void {
    this.searchBedrooms = '';
    this.bedroomOpen = false;
  }

  get topApartments(): Apartment[] {
    return this.apartments
      .filter((apartment) => this.isDisplayableApartment(apartment))
      .slice(0, 4);
  }

  loadApartments(): void {
    this.loading = true;

    this.apartmentService.getApartments().subscribe({
      next: (data) => {
        console.log('Apartments loaded:', data);
        this.apartments = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Apartment API error:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadAgents(): void {
    this.agentsLoading = true;

    this.agentService.getAgents().subscribe({
      next: (data) => {
        this.agents = data.slice(0, 4);
        this.agentsLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Agents API error:', err);
        this.agents = [];
        this.agentsLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  getAgentName(agent: Agent): string {
    return agent.fullName || agent.name || agent.userName || 'Agent';
  }

  getAgentImage(agent: Agent): string {
    return toMediaUrl(agent.profilePictureUrl || agent.profilePicture || agent.avatarUrl) || '/agent1.jpg';
  }

  getAgentRating(agent: Agent): number {
    return agent.averageRating || agent.rating || 0;
  }

  getClosedDeals(agent: Agent): number {
    return agent.closedDeals || 0;
  }

  getAgentLocation(agent: Agent): string {
    return agent.location || 'Tbilisi, Georgia';
  }

  fixAgentImage(event: Event): void {
    tryNextProfileImageUrl(event);
  }

  getApartmentImage(apartment: Apartment): string {
    return toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) || '/property-placeholder.svg';
  }

  getApartmentTitle(apartment: Apartment): string {
    return apartment.title?.trim() || `Apartment #${apartment.id}`;
  }

  getApartmentAddress(apartment: Apartment): string {
    return apartment.address?.trim() || 'Address not provided';
  }

  getApartmentDescription(apartment: Apartment): string {
    return apartment.description?.trim() || 'No description provided.';
  }

  searchHomes(): void {
    void this.router.navigate(['/ExploreProperty'], {
      queryParams: {
        mode: this.searchMode,
        location: this.searchLocation || null,
        budget: this.toUsd(this.appliedBudgetMax),
        budgetMin: this.toUsd(this.appliedBudgetMin),
        budgetCurrency: this.budgetCurrency,
        bedrooms: this.searchBedrooms || null,
        moveIn: this.searchMoveIn || null,
      },
    });
  }

  useQuickFilter(filter: string): void {
    void this.router.navigate(['/ExploreProperty'], {
      queryParams: { mode: this.searchMode, feature: filter },
    });
  }

  public toggleAdvancedFilters(): void {
    this.advancedFiltersOpen = !this.advancedFiltersOpen;
  }

  public openAiHomeMatch(): void {
    void this.router.navigate(['/ai-home-match']);
  }

  private isDisplayableApartment(apartment: Apartment): boolean {
    return !!apartment.title?.trim() && Number(apartment.price) > 0;
  }

  private normalizeBudget(value: number | null): number | null {
    const normalized = Number(value);
    return value == null || !Number.isFinite(normalized) || normalized < 0 ? null : normalized;
  }

  private toUsd(value: number | null): number | null {
    if (value == null) return null;
    return this.budgetCurrency === 'GEL' ? Math.round(value / 2.7) : value;
  }
}
