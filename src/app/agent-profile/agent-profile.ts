import { FormsModule } from '@angular/forms';
import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { Agent as ApiAgent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { toMediaUrl, tryNextProfileImageUrl } from '../utils/api-media';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApartmentService } from '../services/apartment.service';
import { agentDistricts, districtKey, searchKey, whatsappChatUrl } from '../utils/agent-areas';
import { lockPageScroll, unlockPageScroll } from '../utils/page-scroll-lock';
import { whatsappDigits } from '../utils/phone';
import { languageShortList } from '../utils/agent-languages';
import { NgIf, NgFor, DecimalPipe } from '@angular/common';
import { PhotoUrlPipe } from '../shared/photo-url.pipe';

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
  /** Spoken languages as card labels, e.g. "Ge, En, Ru". */
  languages: string;
  /** Districts of the agent's published listings, most listings first. */
  districts: string[];
  /** Account ids the agent's listings are filed under. */
  accountIds: string[];
}

@Component({
  selector: 'app-agent-profile',
  templateUrl: './agent-profile.html',
  styleUrl: './agent-profile.css',
  imports: [PhotoUrlPipe, NgIf, NgFor, RouterLink, DecimalPipe, FormsModule],
})
export class AgentProfile implements OnInit {
  agents: AgentCard[] = [];
  allAgents: AgentCard[] = [];

  isLoading = true;
  errorMessage = '';

  searchQuery = '';
  /** Neighborhood from the hero search; matches the agent's location or bio. */
  selectedDistrict = '';
  districtOpen = false;

  pickDistrict(district: string): void {
    this.selectedDistrict = district;
    this.districtOpen = false;
    this.onFilterChange();
  }

  /** Close the neighborhood menu on a click outside it. */
  @HostListener('document:click', ['$event'])
  closeDistrictMenu(event: MouseEvent): void {
    if (this.districtOpen && !(event.target as HTMLElement).closest?.('.agents-search-area')) {
      this.districtOpen = false;
      this.cdr.detectChanges();
    }
  }
  /** Neighbourhoods where at least one agent has listings (so a choice never gives 0 agents). */
  districts: string[] = [];
  /** Keyboard: highlighted row in the neighbourhood menu (0 = All Neighborhoods). */
  activeDistrictIndex = 0;

  get districtOptions(): string[] {
    return ['', ...this.districts];
  }

  toggleDistrictMenu(): void {
    this.districtOpen = !this.districtOpen;
    this.activeDistrictIndex = Math.max(0, this.districtOptions.indexOf(this.selectedDistrict));
    // Phones: bring the field to the top so the whole list fits above the bottom bar.
    if (this.districtOpen && window.innerWidth <= 600) {
      window.setTimeout(() => document.querySelector('.agents-search-area')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  }

  onDistrictKeydown(event: KeyboardEvent): void {
    const options = this.districtOptions;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.districtOpen) {
        this.districtOpen = true;
        this.activeDistrictIndex = Math.max(0, options.indexOf(this.selectedDistrict));
      } else {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.activeDistrictIndex = (this.activeDistrictIndex + step + options.length) % options.length;
      }
      window.setTimeout(() => document.querySelector<HTMLElement>('.agents-area-menu .active')?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter' && this.districtOpen) {
      event.preventDefault();
      this.pickDistrict(options[this.activeDistrictIndex] ?? '');
    } else if (event.key === 'Escape' && this.districtOpen) {
      event.stopPropagation();
      this.districtOpen = false;
    }
  }
  selectedSort = 'name-az';
  selectedPhoneAgent: AgentCard | null = null;

  skeletonCards = [1, 2, 3, 4];

  constructor(
    private agentService: AgentService,
    private apartmentService: ApartmentService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Search, neighbourhood and sort come back from the address (Back from a profile, refresh).
    const query = this.route.snapshot.queryParamMap;
    this.searchQuery = query.get('q') || '';
    // The neighbourhood picker was removed; old links with ?district= no longer filter.
    this.selectedDistrict = '';
    this.selectedSort = query.get('sort') || 'name-az';
    this.loadAgents();
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: this.searchQuery.trim() || null,
        district: null,
        sort: this.selectedSort !== 'name-az' ? this.selectedSort : null,
      },
    });
  }

  /** Districts from published listings, for the filter, the cards and the menu. */
  private loadAgentAreas(): void {
    this.apartmentService.getApartments().subscribe({
      next: (apartments) => {
        for (const agent of this.allAgents) {
          agent.districts = agentDistricts(apartments, agent.accountIds);
          if (agent.districts.length) agent.location = agent.districts.slice(0, 3).join(', ');
        }
        const seen = new Set<string>();
        this.districts = this.allAgents
          .flatMap((agent) => agent.districts)
          .filter((district) => (seen.has(district) ? false : (seen.add(district), true)))
          .sort((a, b) => a.localeCompare(b));
        this.onFilterChange();
      },
      error: () => undefined,
    });
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
          .filter(
            (agent) =>
              !/^admin(istrator)?$/i.test((agent.userName || '').trim()) &&
              !/^admin(istrator)?$/i.test((agent.fullName || agent.name || '').trim()),
          )
          .map((agent) => this.toAgentCard(agent));
        this.onFilterChange();
        this.loadAgentAreas();

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
    // Georgian and Latin spellings both match ("Giorgi" finds "გიორგი" and the other way round).
    const query = searchKey(this.searchQuery);
    const district = districtKey(this.selectedDistrict);
    const filtered = this.allAgents.filter((agent) => {
      if (district && !agent.districts.some((item) => districtKey(item) === district)) return false;
      if (!query) return true;
      return [agent.name, agent.location, agent.bio].some((text) => searchKey(text).includes(query));
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

    if (!this.isLoading) this.syncUrl();
    this.cdr.detectChanges();
  }

  /** Search button: apply the filters and jump to the results. */
  runSearch(): void {
    this.onFilterChange();
    document.getElementById('agents-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private phoneDialogOpener: HTMLElement | null = null;

  onCall(agent: AgentCard): void {
    this.phoneDialogOpener = document.activeElement as HTMLElement | null;
    this.selectedPhoneAgent = agent;
    lockPageScroll();
    window.setTimeout(() => document.querySelector<HTMLElement>('.phone-dialog .dialog-close')?.focus());
  }

  /** Tab / Shift+Tab stay inside the open contact window. */
  @HostListener('document:keydown', ['$event'])
  keepFocusInDialog(event: KeyboardEvent): void {
    if (!this.selectedPhoneAgent || event.key !== 'Tab') return;
    const dialog = document.querySelector<HTMLElement>('.phone-dialog');
    if (!dialog) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || !dialog.contains(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || !dialog.contains(active))) { event.preventDefault(); first.focus(); }
  }

  phoneCopied = false;

  copyPhone(phone: string): void {
    void navigator.clipboard?.writeText(phone).then(() => {
      this.phoneCopied = true;
      this.cdr.detectChanges();
      setTimeout(() => { this.phoneCopied = false; this.cdr.detectChanges(); }, 1800);
    });
  }

  closePhoneDialog(): void {
    if (!this.selectedPhoneAgent) return;
    this.phoneCopied = false;
    this.selectedPhoneAgent = null;
    unlockPageScroll();
    this.phoneDialogOpener?.focus?.();
    this.phoneDialogOpener = null;
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
      window.open(whatsappChatUrl(phone), '_blank', 'noopener');
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
      // Never the e-mail address: the listings' districts replace this once loaded.
      location: agent.location || 'Tbilisi',
      closedDeals: agent.closedDeals || 0,
      rating: agent.averageRating || agent.rating || 0,
      ratingCount: agent.ratingCount || 0,
      avatarUrl:
        toMediaUrl(agent.profilePictureUrl || agent.profilePicture || agent.avatarUrl) ||
        '/agent1.jpg',
      bio:
        agent.bio ||
        'Verified real estate agent ready to help with apartments and property questions.',
      phoneNumber: agent.phoneNumber?.trim() || '',
      languages: languageShortList(agent.languages),
      districts: [],
      accountIds: [agent.userId, agent.id].filter((id): id is string => !!id),
    };
  }
}
