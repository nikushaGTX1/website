import { HttpErrorResponse } from '@angular/common/http';
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

  searchQuery = '';
  statusFilter: StatusFilter = 'all';
  sourceFilter = 'all';
  assignmentFilter: AssignmentFilter = 'all';

  createDialogOpen = false;
  creatingLead = false;
  createErrorMessage = '';
  preferredDistrictsText = '';
  manualLeadForm: CreateCrmLeadRequest = this.emptyLeadForm();
  private previouslyFocusedElement: HTMLElement | null = null;

  constructor(
    private crmService: CrmService,
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
      agents: this.isAdmin
        ? this.agentService.getAgents().pipe(catchError(() => of([] as Agent[])))
        : of([] as Agent[]),
    }).subscribe({
      next: ({ leads, metrics, agents }) => {
        this.leads = leads;
        this.agents = agents;
        this.metrics = metrics || this.calculateMetrics(leads);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.leads = [];
        this.metrics = this.emptyMetrics();
        this.loading = false;
        this.errorMessage = this.apiError(error, 'Could not load the CRM pipeline.');
        this.cdr.detectChanges();
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
    this.previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    this.manualLeadForm = this.emptyLeadForm();
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
    if (this.creatingLead) return;

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

    const request: CreateCrmLeadRequest = {
      ...this.manualLeadForm,
      fullName,
      email: email || undefined,
      phoneNumber: phoneNumber || undefined,
      preferredDistricts: this.preferredDistrictsText
        .split(',')
        .map((district) => district.trim())
        .filter(Boolean),
      budgetMin: this.positiveNumber(this.manualLeadForm.budgetMin),
      budgetMax: this.positiveNumber(this.manualLeadForm.budgetMax),
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
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.creatingLead = false;
        this.createErrorMessage = this.apiError(error, 'Could not create this lead.');
        this.cdr.detectChanges();
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

  private emptyLeadForm(): CreateCrmLeadRequest {
    return {
      fullName: '',
      email: '',
      phoneNumber: '',
      preferredContactMethod: 'phone',
      source: 'manual',
      status: 'new',
      currency: 'USD',
      assignedAgentId: null,
      preferredPropertyType: '',
    };
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
    const tasks = leads.flatMap((lead) =>
      lead.tasks?.length ? lead.tasks : lead.nextTask ? [lead.nextTask] : [],
    );
    const wonLeads = leads.filter((lead) => lead.status === 'won').length;
    const closedLeads = leads.filter((lead) => lead.status === 'won' || lead.status === 'lost').length;

    return {
      totalLeads: leads.length,
      newLeads: leads.filter((lead) => lead.status === 'new').length,
      activeLeads: leads.filter((lead) => lead.status !== 'won' && lead.status !== 'lost').length,
      overdueTasks: tasks.filter((task) => this.isOverdue(task)).length,
      upcomingViewings: tasks.filter((task) =>
        task.type === 'viewing' && task.status !== 'completed' &&
        (!task.dueAt || Date.parse(task.dueAt) >= Date.now()),
      ).length,
      wonLeads,
      conversionRate: closedLeads ? (wonLeads / closedLeads) * 100 : 0,
    };
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
        this.metrics = metrics;
        this.cdr.detectChanges();
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
}
