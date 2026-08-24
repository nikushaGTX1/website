import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { Agent } from '../../models/agent';
import {
  CRM_LEAD_STATUSES,
  CreateCrmLeadRequest,
  CrmLead,
  CrmLeadStatus,
  CrmMetrics,
  CrmTask,
} from '../../models/crm';
import { AgentService } from '../../services/agent.service';
import { AuthService } from '../../services/auth.service';
import { CrmService } from '../../services/crm.service';

type StatusFilter = 'all' | CrmLeadStatus;
type AssignmentFilter = 'all' | 'mine' | 'unassigned';
type ManualRentalPeriod = '' | '6' | '12' | '12+';
type ManualPetType = '' | 'none' | 'dog' | 'cat';
type ManualPetSize = '' | 'small' | 'medium' | 'large';

interface ManualLeadForm extends CreateCrmLeadRequest {
  rentalPeriodMonths: ManualRentalPeriod;
  petType: ManualPetType;
  petSize: ManualPetSize;
}

@Component({
  selector: 'app-crm-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './crm-dashboard.html',
  styleUrl: './crm-dashboard.css',
})
export class CrmDashboard implements OnInit {
  @ViewChild('createLeadDialog') private createLeadDialog?: ElementRef<HTMLElement>;

  readonly statuses = CRM_LEAD_STATUSES;
  readonly statusLabels: Record<CrmLeadStatus, string> = {
    new: 'New',
    contacted: 'Contacted',
    qualified: 'Qualified',
    viewing: 'Viewing',
    negotiation: 'Negotiation',
    won: 'Won',
    lost: 'Lost',
  };

  readonly statusDescriptions: Record<CrmLeadStatus, string> = {
    new: 'Needs first contact',
    contacted: 'Conversation started',
    qualified: 'Fit and budget confirmed',
    viewing: 'Property visit planned',
    negotiation: 'Terms in progress',
    won: 'Successfully converted',
    lost: 'Closed without a deal',
  };

  leads: CrmLead[] = [];
  agents: Agent[] = [];
  metrics: CrmMetrics = this.emptyMetrics();
  loading = true;
  errorMessage = '';
  successMessage = '';

  generatingQuestionnaireLink = false;
  linkCopied = false;

  searchQuery = '';
  statusFilter: StatusFilter = 'all';
  sourceFilter = 'all';
  assignmentFilter: AssignmentFilter = 'all';

  createDialogOpen = false;
  creatingLead = false;
  createErrorMessage = '';
  preferredDistrictsText = '';
  leadMenu: 'budget' | 'property' | 'rooms' | 'bedrooms' | null = null;
  readonly leadBudgetMinimum = 0;
  readonly leadBudgetMaximum = 5000;
  readonly leadBudgetStep = 100;
  readonly propertyTypes = ['Apartment', 'House', 'Commercial space', 'Country house', 'Land'];
  readonly roomOptions = [1, 2, 3, 4, 5, 6, 7, 8];
  readonly rentalPeriodOptions: Array<{ value: Exclude<ManualRentalPeriod, ''>; label: string }> = [
    { value: '6', label: '6 months' },
    { value: '12', label: '12 months' },
    { value: '12+', label: '12+ months' },
  ];
  readonly petTypeOptions: Array<{ value: Exclude<ManualPetType, ''>; label: string; icon: string }> = [
    { value: 'none', label: 'No pet', icon: 'fa-ban' },
    { value: 'dog', label: 'Dog', icon: 'fa-dog' },
    { value: 'cat', label: 'Cat', icon: 'fa-cat' },
  ];
  readonly petSizeOptions: Array<{ value: Exclude<ManualPetSize, ''>; label: string }> = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Big' },
  ];
  private readonly uploaderLeadSources = [{ value: 'referral', label: 'Referral' }];
  private readonly agentLeadSources = [{ value: 'manual', label: 'Manual' }];
  private readonly managerLeadSources = [
    { value: 'manual', label: 'Manual' },
    { value: 'referral', label: 'Referral' },
    { value: 'phone', label: 'Phone' },
    { value: 'website', label: 'Website' },
    { value: 'ai-match', label: 'AI match' },
  ];
  manualLeadForm: ManualLeadForm = this.emptyLeadForm();
  private previouslyFocusedElement: HTMLElement | null = null;

  constructor(
    private crmService: CrmService,
    private http: HttpClient,
    private agentService: AgentService,
    readonly authService: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin;
  }

  get isManager(): boolean {
    return this.authService.isCrmManager;
  }

  get isUploader(): boolean {
    return this.authService.isCrmUploader && !this.isManager;
  }

  get canCreateLead(): boolean {
    return this.authService.canWorkCrmLeads || this.isUploader;
  }

  get canGenerateQuestionnaireLink(): boolean {
    return this.authService.canOpenCrm;
  }

  get allowedLeadSources(): Array<{ value: string; label: string }> {
    if (this.isUploader) return this.uploaderLeadSources;
    if (this.authService.isCrmAgent && !this.isManager) return this.agentLeadSources;
    return this.managerLeadSources;
  }

  get bedroomOptions(): number[] {
    const rooms = this.manualLeadForm.rooms || 0;
    return Array.from({ length: rooms }, (_, index) => index + 1);
  }

  toggleLeadMenu(menu: 'budget' | 'property' | 'rooms' | 'bedrooms'): void {
    if (menu === 'bedrooms' && !this.manualLeadForm.rooms) return;
    this.leadMenu = this.leadMenu === menu ? null : menu;
  }

  selectRooms(rooms: number): void {
    this.manualLeadForm.rooms = rooms;
    if ((this.manualLeadForm.bedrooms || 0) > rooms) this.manualLeadForm.bedrooms = undefined;
    this.leadMenu = 'bedrooms';
  }

  selectManualPet(type: Exclude<ManualPetType, ''>): void {
    this.manualLeadForm.petType = type;
    if (type === 'none') this.manualLeadForm.petSize = '';
  }

  trackLeadSource(_index: number, source: { value: string }): string {
    return source.value;
  }

  clampLeadBudget(field: 'budgetMin' | 'budgetMax'): void {
    const value = this.manualLeadForm[field];
    if (value === undefined || value === null || String(value).trim() === '') return;

    const numericValue = Number(value);
    this.manualLeadForm[field] = Number.isFinite(numericValue)
      ? Math.min(this.leadBudgetMaximum, Math.max(this.leadBudgetMinimum, numericValue))
      : this.leadBudgetMinimum;
  }

  updateLeadBudgetRange(field: 'budgetMin' | 'budgetMax'): void {
    this.clampLeadBudget(field);

    const minimum = Number(this.manualLeadForm.budgetMin ?? this.leadBudgetMinimum);
    const maximum = Number(this.manualLeadForm.budgetMax ?? this.leadBudgetMaximum);
    if (minimum <= maximum) return;

    if (field === 'budgetMin') {
      this.manualLeadForm.budgetMin = maximum;
    } else {
      this.manualLeadForm.budgetMax = minimum;
    }
  }

  get metricCards(): Array<{
    label: string;
    value: string;
    detail: string;
    icon: string;
    tone: string;
  }> {
    return [
      {
        label: 'Total leads',
        value: String(this.metrics.totalLeads),
        detail: `${this.metrics.activeLeads} active`,
        icon: 'fa-solid fa-users',
        tone: 'purple',
      },
      {
        label: 'New leads',
        value: String(this.metrics.newLeads),
        detail: 'Awaiting first contact',
        icon: 'fa-solid fa-user-plus',
        tone: 'blue',
      },
      {
        label: 'Overdue tasks',
        value: String(this.metrics.overdueTasks),
        detail: 'Needs attention',
        icon: 'fa-solid fa-clock',
        tone: this.metrics.overdueTasks ? 'red' : 'green',
      },
      {
        label: 'Upcoming viewings',
        value: String(this.metrics.upcomingViewings),
        detail: 'Open viewing tasks',
        icon: 'fa-regular fa-calendar-check',
        tone: 'gold',
      },
      {
        label: 'Conversion',
        value: `${this.metrics.conversionRate.toFixed(1)}%`,
        detail: `${this.metrics.wonLeads} won`,
        icon: 'fa-solid fa-chart-line',
        tone: 'green',
      },
    ];
  }

  get sourceOptions(): string[] {
    return [...new Set(this.leads.map((lead) => lead.source).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }

  get visibleStatuses(): readonly CrmLeadStatus[] {
    return this.statusFilter === 'all' ? this.statuses : [this.statusFilter];
  }

  get filteredLeads(): CrmLead[] {
    const query = this.searchQuery.trim().toLowerCase();
    const currentUserId = (this.authService.currentUser?.id || '').toLowerCase();

    return this.leads.filter((lead) => {
      const matchesSearch = !query || [
        lead.fullName,
        lead.email,
        lead.phoneNumber,
        lead.source,
        lead.assignedAgentName,
        lead.apartmentTitle,
        ...(lead.preferredDistricts || []),
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesSource = this.sourceFilter === 'all' || lead.source === this.sourceFilter;
      const assignedAgentId = (lead.assignedAgentId || '').toLowerCase();
      const matchesAssignment =
        this.assignmentFilter === 'all' ||
        (this.assignmentFilter === 'unassigned' && !assignedAgentId) ||
        (this.assignmentFilter === 'mine' && !!currentUserId && assignedAgentId === currentUserId);

      return matchesSearch && matchesSource && matchesAssignment;
    });
  }

  get hasFilters(): boolean {
    return !!this.searchQuery ||
      this.statusFilter !== 'all' ||
      this.sourceFilter !== 'all' ||
      this.assignmentFilter !== 'all';
  }

  loadDashboard(): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      leads: this.crmService.getLeads(),
      metrics: this.crmService.getMetrics().pipe(catchError(() => of(null))),
      agents: this.isManager
        ? this.agentService.getAgents().pipe(catchError(() => of([] as Agent[])))
        : of([] as Agent[]),
    }).subscribe({
      next: ({ leads, metrics, agents }) => {
        this.leads = this.scopeLeads(leads);
        this.agents = agents;
        const calculatedMetrics = this.calculateMetrics(this.leads);
        this.metrics = this.isManager && metrics
          ? { ...metrics, overdueTasks: calculatedMetrics.overdueTasks }
          : calculatedMetrics;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.leads = [];
        this.metrics = this.emptyMetrics();
        this.loading = false;
        this.errorMessage = this.apiError(error, 'Could not load the CRM pipeline.');
        this.cdr.markForCheck();
      },
    });
  }

  leadsForStatus(status: CrmLeadStatus): CrmLead[] {
    return this.filteredLeads
      .filter((lead) => lead.status === status)
      .sort((left, right) => this.leadSortValue(right) - this.leadSortValue(left));
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.statusFilter = 'all';
    this.sourceFilter = 'all';
    this.assignmentFilter = 'all';
  }

  openCreateDialog(): void {
    if (!this.canCreateLead) return;
    this.previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    this.manualLeadForm = this.emptyLeadForm();
    this.manualLeadForm.source = this.allowedLeadSources[0].value;
    this.preferredDistrictsText = '';
    this.createErrorMessage = '';
    this.createDialogOpen = true;
    setTimeout(() => this.focusInitialControl(this.createLeadDialog?.nativeElement));
  }

  closeCreateDialog(): void {
    if (this.creatingLead) return;
    const focusTarget = this.previouslyFocusedElement;
    this.createDialogOpen = false;
    this.createErrorMessage = '';
    this.previouslyFocusedElement = null;
    setTimeout(() => focusTarget?.focus());
  }

  createLead(): void {
    if (!this.canCreateLead || this.creatingLead) return;

    if (this.manualLeadForm.goal !== 'rent' && this.manualLeadForm.goal !== 'buy') {
      this.createErrorMessage = 'Please choose a deal type.';
      return;
    }

    const fullName = this.manualLeadForm.fullName.trim();
    const email = this.manualLeadForm.email?.trim() || '';
    const phoneNumber = this.manualLeadForm.phoneNumber?.trim() || '';

    if (!fullName) {
      this.createErrorMessage = 'Please enter the lead name.';
      return;
    }

    if (!email && !phoneNumber) {
      this.createErrorMessage = 'Add an email address or phone number.';
      return;
    }

    this.clampLeadBudget('budgetMin');
    this.clampLeadBudget('budgetMax');
    const budgetMin = this.nonNegativeNumber(this.manualLeadForm.budgetMin);
    const budgetMax = this.nonNegativeNumber(this.manualLeadForm.budgetMax);
    if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
      this.createErrorMessage = 'Minimum budget cannot be greater than maximum budget.';
      this.leadMenu = 'budget';
      return;
    }

    const request: CreateCrmLeadRequest = {
      source: this.isUploader ? 'referral' : (this.authService.isCrmAgent && !this.isManager ? 'manual' : this.manualLeadForm.source),
      fullName,
      email: email || undefined,
      phoneNumber: phoneNumber || undefined,
      preferredContactMethod: this.manualLeadForm.preferredContactMethod,
      status: this.manualLeadForm.status,
      goal: this.manualLeadForm.goal,
      currency: this.manualLeadForm.currency,
      preferredDistricts: this.preferredDistrictsText
        .split(',')
        .map((district) => district.trim())
        .filter(Boolean),
      preferences: this.manualLeadPreferences(),
      budgetMin,
      budgetMax,
      preferredPropertyType: this.manualLeadForm.preferredPropertyType || undefined,
      rooms: this.nonNegativeNumber(this.manualLeadForm.rooms),
      bedrooms: this.nonNegativeNumber(this.manualLeadForm.bedrooms),
      assignedAgentId: this.manualLeadForm.assignedAgentId || null,
    };

    this.creatingLead = true;
    this.createErrorMessage = '';

    this.crmService.createLead(request).subscribe({
      next: (createdLead) => {
        this.leads = [createdLead, ...this.leads];
        this.metrics = this.calculateMetrics(this.leads);
        this.refreshMetrics();
        this.creatingLead = false;
        this.closeCreateDialog();
        this.successMessage = `${createdLead.fullName} was added to the pipeline.`;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.creatingLead = false;
        this.createErrorMessage = this.apiError(error, 'Could not create this lead.');
        this.cdr.markForCheck();
      },
    });
  }

  statusLabel(status: CrmLeadStatus): string {
    return this.statusLabels[status];
  }

  agentId(agent: Agent): string {
    return agent.userId || agent.id || '';
  }

  agentName(agent: Agent): string {
    return agent.fullName || agent.name || agent.userName || agent.email || 'Agent';
  }

  initials(lead: CrmLead): string {
    return lead.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'L';
  }

  budgetLabel(lead: CrmLead): string {
    const minimum = this.positiveNumber(lead.budgetMin);
    const maximum = this.positiveNumber(lead.budgetMax);
    const format = (value: number): string =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: this.safeCurrency(lead.currency), maximumFractionDigits: 0 })
        .format(value);

    if (minimum && maximum) return `${format(minimum)} – ${format(maximum)}`;
    if (maximum) return `Up to ${format(maximum)}`;
    if (minimum) return `From ${format(minimum)}`;
    return 'Budget not set';
  }

  nextAction(lead: CrmLead): CrmTask | undefined {
    if (lead.status === 'won' || lead.status === 'lost') {
      return undefined;
    }

    if (lead.nextTask && lead.nextTask.status !== 'completed') {
      return lead.nextTask;
    }

    return (lead.tasks || [])
      .filter((task) => task.status !== 'completed' && !!task.dueAt)
      .sort((left, right) => Date.parse(left.dueAt || '') - Date.parse(right.dueAt || ''))[0];
  }

  formatDate(value?: string): string {
    if (!value) return 'No date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No date';

    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  isOverdue(task: CrmTask): boolean {
    return task.status !== 'completed' && !!task.dueAt && Date.parse(task.dueAt) < Date.now();
  }

  identifyLead(_: number, lead: CrmLead): number {
    return lead.id;
  }

  identifyStatus(_: number, status: CrmLeadStatus): string {
    return status;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.createDialogOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeCreateDialog();
      return;
    }

    if (event.key === 'Tab') {
      this.trapDialogFocus(event, this.createLeadDialog?.nativeElement);
    }
  }

  private emptyLeadForm(): ManualLeadForm {
    return {
      fullName: '',
      email: '',
      phoneNumber: '',
      preferredContactMethod: 'phone',
      // Role-specific source is applied in openCreateDialog(), after Angular
      // has initialized injected services. This method also runs during field
      // initialization, when authService is not available yet.
      source: 'manual',
      status: 'new',
      goal: '',
      currency: 'USD',
      budgetMin: this.leadBudgetMinimum,
      budgetMax: this.leadBudgetMaximum,
      assignedAgentId: null,
      preferredPropertyType: '',
      rentalPeriodMonths: '',
      petType: '',
      petSize: '',
    };
  }

  private manualLeadPreferences(): string | undefined {
    const details: string[] = [];
    const notes = this.manualLeadForm.preferences?.trim();

    if (notes) details.push(notes);

    if (
      this.manualLeadForm.goal === 'rent' &&
      this.manualLeadForm.rentalPeriodMonths
    ) {
      const period = this.rentalPeriodOptions.find(
        (option) => option.value === this.manualLeadForm.rentalPeriodMonths,
      );
      if (period) details.push(`Rental period: ${period.label}`);
    }

    if (this.manualLeadForm.petType === 'none') {
      details.push('Pet: None');
    } else if (this.manualLeadForm.petType) {
      const type = this.manualLeadForm.petType === 'dog' ? 'Dog' : 'Cat';
      const size = this.petSizeOptions.find(
        (option) => option.value === this.manualLeadForm.petSize,
      )?.label;
      details.push(`Pet: ${type}${size ? ` (${size})` : ''}`);
    }

    return details.length ? details.join(' · ') : undefined;
  }

  private emptyMetrics(): CrmMetrics {
    return {
      totalLeads: 0,
      newLeads: 0,
      activeLeads: 0,
      overdueTasks: 0,
      upcomingViewings: 0,
      wonLeads: 0,
      conversionRate: 0,
    };
  }

  private calculateMetrics(leads: CrmLead[]): CrmMetrics {
    const activeLeads = leads.filter(
      (lead) => lead.status !== 'won' && lead.status !== 'lost',
    );
    const tasks = activeLeads.flatMap((lead) =>
      lead.tasks?.length ? lead.tasks : lead.nextTask ? [lead.nextTask] : [],
    );
    const wonLeads = leads.filter((lead) => lead.status === 'won').length;
    const closedLeads = leads.filter((lead) => lead.status === 'won' || lead.status === 'lost').length;

    return {
      totalLeads: leads.length,
      newLeads: leads.filter((lead) => lead.status === 'new').length,
      activeLeads: activeLeads.length,
      overdueTasks: tasks.filter((task) => this.isOverdue(task)).length,
      upcomingViewings: tasks.filter((task) =>
        task.type === 'viewing' && task.status !== 'completed' &&
        (!task.dueAt || Date.parse(task.dueAt) >= Date.now()),
      ).length,
      wonLeads,
      conversionRate: closedLeads ? (wonLeads / closedLeads) * 100 : 0,
    };
  }

  private scopeLeads(leads: CrmLead[]): CrmLead[] {
    if (this.isManager) return leads;

    const userId = (this.authService.currentUser?.id || '').toLowerCase();
    if (!userId) return [];

    if (this.authService.isCrmAgent) {
      return leads.filter((lead) =>
        (lead.assignedAgentId || '').toLowerCase() === userId,
      );
    }

    return leads.filter((lead) => {
      const uploaderUserId = (lead.uploaderUserId || '').toLowerCase();
      const createdByUserId = (lead.createdByUserId || '').toLowerCase();
      return uploaderUserId === userId || createdByUserId === userId;
    });
  }

  private leadSortValue(lead: CrmLead): number {
    return Date.parse(lead.lastActivityAt || lead.updatedAt || lead.createdAt || '') || 0;
  }

  private positiveNumber(value?: number): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
  }

  private nonNegativeNumber(value?: number): number | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
  }

  private safeCurrency(value?: string): string {
    const currency = (value || 'USD').toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
  }

  private refreshMetrics(): void {
    this.crmService.getMetrics().subscribe({
      next: (metrics) => {
        const calculatedMetrics = this.calculateMetrics(this.leads);
        this.metrics = this.isManager
          ? { ...metrics, overdueTasks: calculatedMetrics.overdueTasks }
          : calculatedMetrics;
        this.cdr.markForCheck();
      },
      error: () => undefined,
    });
  }

  private focusInitialControl(dialog?: HTMLElement): void {
    if (!dialog) return;
    const preferred = dialog.querySelector<HTMLElement>('[data-initial-focus]');
    (preferred || this.focusableElements(dialog)[0] || dialog).focus();
  }

  private trapDialogFocus(event: KeyboardEvent, dialog?: HTMLElement): void {
    if (!dialog) return;
    const focusable = this.focusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.offsetParent !== null);
  }

  private apiError(error: HttpErrorResponse, fallback: string): string {
    if (error.status === 401) return 'Your session expired. Please sign in again.';
    if (error.status === 403) return 'You do not have permission to access these leads.';

    const message = typeof error.error === 'string'
      ? error.error
      : error.error?.message || error.error?.title;
    return message || fallback;
  }



  generateQuestionnaireLink(): void {
    if (!this.canGenerateQuestionnaireLink || this.generatingQuestionnaireLink) {
      return;
    }

    this.generatingQuestionnaireLink = true;
    this.linkCopied = false;
    this.errorMessage = '';

    this.http.post<{
      token: string;
      path: string;
    }>(
      'https://websiteapi-production-c970.up.railway.app/api/Crm/questionnaire-links',
      {}
    ).subscribe({
      next: async (response) => {
        this.generatingQuestionnaireLink = false;

        const fullUrl = `${window.location.origin}${response.path}`;

        try {
          await navigator.clipboard.writeText(fullUrl);

          this.linkCopied = true;
          this.successMessage = 'Questionnaire link copied to clipboard.';

          setTimeout(() => {
            this.linkCopied = false;
            this.cdr.markForCheck();
          }, 2500);
        } catch (error) {
          console.error('Could not copy questionnaire link:', error);

          window.prompt(
            'Copy questionnaire link:',
            fullUrl
          );
        }

        this.cdr.markForCheck();
      },

      error: (error: HttpErrorResponse) => {
        this.generatingQuestionnaireLink = false;
        this.errorMessage = this.apiError(
          error,
          'Could not generate questionnaire link.'
        );
        this.cdr.markForCheck();
      },
    });
  }
}
