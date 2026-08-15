import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { Agent } from '../../models/agent';
import {
  CRM_LEAD_STATUSES,
  CRM_TASK_TYPES,
  CrmLead,
  CrmLeadActivity,
  CrmLeadStatus,
  CrmTask,
  CrmTaskType,
  UpdateCrmLeadRequest,
} from '../../models/crm';
import { AgentService } from '../../services/agent.service';
import { AuthService } from '../../services/auth.service';
import { CrmService } from '../../services/crm.service';

interface TaskForm {
  title: string;
  description: string;
  type: CrmTaskType;
  dueAt: string;
}

@Component({
  selector: 'app-crm-lead-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './lead-detail.html',
  styleUrl: './lead-detail.css',
})
export class CrmLeadDetail implements OnInit {
  readonly statuses = CRM_LEAD_STATUSES;
  readonly taskTypes = CRM_TASK_TYPES;
  readonly statusLabels: Record<CrmLeadStatus, string> = {
    new: 'New',
    contacted: 'Contacted',
    qualified: 'Qualified',
    viewing: 'Viewing',
    negotiation: 'Negotiation',
    won: 'Won',
    lost: 'Lost',
  };

  lead: CrmLead | null = null;
  agents: Agent[] = [];
  loading = true;
  pageError = '';
  successMessage = '';

  editing = false;
  savingLead = false;
  statusSaving = false;
  assignmentSaving = false;
  noteSaving = false;
  taskSaving = false;
  taskActionId = 0;

  leadForm: UpdateCrmLeadRequest = this.emptyLeadForm();
  preferredDistrictsText = '';
  selectedAgentId = '';
  noteBody = '';
  taskForm: TaskForm = this.emptyTaskForm();

  constructor(
    private route: ActivatedRoute,
    private crmService: CrmService,
    private agentService: AgentService,
    readonly authService: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const leadId = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(leadId) || leadId <= 0) {
      this.loading = false;
      this.pageError = 'This lead link is not valid.';
      return;
    }

    this.loadLead(leadId);
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin;
  }

  get openTasks(): CrmTask[] {
    return (this.lead?.tasks || [])
      .filter((task) => task.status !== 'completed')
      .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
  }

  get completedTasks(): CrmTask[] {
    return (this.lead?.tasks || [])
      .filter((task) => task.status === 'completed')
      .sort((left, right) => Date.parse(right.completedAt || right.dueAt) - Date.parse(left.completedAt || left.dueAt));
  }

  get activities(): CrmLeadActivity[] {
    return [...(this.lead?.activities || [])]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  loadLead(leadId = this.lead?.id): void {
    if (!leadId) return;

    this.loading = true;
    this.pageError = '';

    forkJoin({
      lead: this.crmService.getLead(leadId),
      agents: this.isAdmin
        ? this.agentService.getAgents().pipe(catchError(() => of([] as Agent[])))
        : of([] as Agent[]),
    }).subscribe({
      next: ({ lead, agents }) => {
        this.lead = lead;
        this.agents = agents;
        this.selectedAgentId = lead.assignedAgentId || '';
        this.populateLeadForm(lead);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.pageError = this.apiError(error, 'Could not load this lead.');
        this.cdr.detectChanges();
      },
    });
  }

  beginEditing(): void {
    if (!this.lead) return;
    this.populateLeadForm(this.lead);
    this.editing = true;
    this.successMessage = '';
  }

  cancelEditing(): void {
    if (this.savingLead) return;
    if (this.lead) this.populateLeadForm(this.lead);
    this.editing = false;
  }

  saveLead(): void {
    if (!this.lead || this.savingLead) return;

    const fullName = this.leadForm.fullName.trim();
    const email = this.leadForm.email?.trim() || '';
    const phoneNumber = this.leadForm.phoneNumber?.trim() || '';
    const budgetMin = this.positiveNumber(this.leadForm.budgetMin);
    const budgetMax = this.positiveNumber(this.leadForm.budgetMax);

    if (!fullName) {
      this.pageError = 'Full name is required.';
      return;
    }
    if (!email && !phoneNumber) {
      this.pageError = 'Add an email address or phone number.';
      return;
    }
    if (budgetMin && budgetMax && budgetMin > budgetMax) {
      this.pageError = 'Minimum budget cannot be greater than maximum budget.';
      return;
    }

    const request: UpdateCrmLeadRequest = {
      ...this.leadForm,
      fullName,
      email: email || undefined,
      phoneNumber: phoneNumber || undefined,
      goal: this.leadForm.goal?.trim() ?? '',
      currency: this.leadForm.currency || this.lead.currency || 'USD',
      preferences: this.leadForm.preferences?.trim() ?? '',
      preferredContactMethod: this.leadForm.preferredContactMethod || undefined,
      preferredPropertyType: this.leadForm.preferredPropertyType?.trim() || undefined,
      preferredDistricts: this.preferredDistrictsText
        .split(',')
        .map((district) => district.trim())
        .filter(Boolean),
      budgetMin,
      budgetMax,
      bedrooms: this.nonNegativeNumber(this.leadForm.bedrooms),
      apartmentId: this.leadForm.apartmentId || null,
    };

    this.savingLead = true;
    this.pageError = '';
    this.successMessage = '';
    this.crmService.updateLead(this.lead.id, request).subscribe({
      next: (lead) => {
        this.lead = lead;
        this.populateLeadForm(lead);
        this.savingLead = false;
        this.editing = false;
        this.successMessage = 'Lead details saved.';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.savingLead = false;
        this.pageError = this.apiError(error, 'Could not save the lead.');
        this.cdr.detectChanges();
      },
    });
  }

  updateStatus(status: CrmLeadStatus): void {
    if (!this.lead || this.statusSaving || status === this.lead.status) return;

    const previousStatus = this.lead.status;
    this.lead = { ...this.lead, status };
    this.statusSaving = true;
    this.pageError = '';
    this.crmService.updateLeadStatus(this.lead.id, status).subscribe({
      next: (lead) => {
        this.lead = lead;
        this.statusSaving = false;
        this.successMessage = `Lead moved to ${this.statusLabel(status)}.`;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        if (this.lead) this.lead = { ...this.lead, status: previousStatus };
        this.statusSaving = false;
        this.pageError = this.apiError(error, 'Could not update the lead stage.');
        this.cdr.detectChanges();
      },
    });
  }

  assignLead(): void {
    if (!this.isAdmin || !this.lead || this.assignmentSaving) return;

    this.assignmentSaving = true;
    this.pageError = '';
    this.crmService.assignLead(this.lead.id, this.selectedAgentId || null).subscribe({
      next: (lead) => {
        this.lead = lead;
        this.selectedAgentId = lead.assignedAgentId || '';
        this.assignmentSaving = false;
        this.successMessage = lead.assignedAgentName
          ? `Lead assigned to ${lead.assignedAgentName}.`
          : 'Lead moved to the unassigned queue.';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.selectedAgentId = this.lead?.assignedAgentId || '';
        this.assignmentSaving = false;
        this.pageError = this.apiError(error, 'Could not change the assignment.');
        this.cdr.detectChanges();
      },
    });
  }

  addNote(): void {
    if (!this.lead || this.noteSaving) return;
    const body = this.noteBody.trim();
    if (!body) return;

    this.noteSaving = true;
    this.pageError = '';
    this.crmService.createActivity(this.lead.id, { type: 'note', body }).subscribe({
      next: (activity) => {
        if (this.lead) {
          this.lead = {
            ...this.lead,
            activities: [activity, ...(this.lead.activities || [])],
            lastActivityAt: activity.createdAt,
          };
        }
        this.noteBody = '';
        this.noteSaving = false;
        this.successMessage = 'Note added to the timeline.';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.noteSaving = false;
        this.pageError = this.apiError(error, 'Could not add the note.');
        this.cdr.detectChanges();
      },
    });
  }

  createTask(): void {
    if (!this.lead || this.taskSaving) return;
    const title = this.taskForm.title.trim();
    const dueAt = this.toIsoDate(this.taskForm.dueAt);
    if (!title || !dueAt) {
      this.pageError = 'Task title and due date are required.';
      return;
    }

    this.taskSaving = true;
    this.pageError = '';
    this.crmService.createTask(this.lead.id, {
      title,
      type: this.taskForm.type,
      description: this.taskForm.description.trim() || undefined,
      dueAt,
      assignedAgentId: this.lead.assignedAgentId || null,
    }).subscribe({
      next: (task) => {
        if (this.lead) {
          this.lead = {
            ...this.lead,
            tasks: [...(this.lead.tasks || []), task],
          };
        }
        this.taskForm = this.emptyTaskForm();
        this.taskSaving = false;
        this.successMessage = 'Task added.';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.taskSaving = false;
        this.pageError = this.apiError(error, 'Could not create the task.');
        this.cdr.detectChanges();
      },
    });
  }

  toggleTask(task: CrmTask): void {
    if (!this.lead || this.taskActionId) return;
    const status = task.status === 'completed' ? 'open' : 'completed';
    this.taskActionId = task.id;
    this.pageError = '';
    this.crmService.updateTask(this.lead.id, task.id, { status }).subscribe({
      next: (updatedTask) => {
        if (this.lead) {
          this.lead = {
            ...this.lead,
            tasks: (this.lead.tasks || []).map((item) =>
              item.id === updatedTask.id ? updatedTask : item,
            ),
          };
        }
        this.taskActionId = 0;
        this.successMessage = status === 'completed' ? 'Task completed.' : 'Task reopened.';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.taskActionId = 0;
        this.pageError = this.apiError(error, 'Could not update the task.');
        this.cdr.detectChanges();
      },
    });
  }

  statusLabel(status: CrmLeadStatus): string {
    return this.statusLabels[status];
  }

  taskTypeLabel(type: CrmTaskType): string {
    return type === 'follow-up'
      ? 'Follow-up'
      : type.charAt(0).toUpperCase() + type.slice(1);
  }

  agentId(agent: Agent): string {
    return agent.userId || agent.id || '';
  }

  agentName(agent: Agent): string {
    return agent.fullName || agent.name || agent.userName || agent.email || 'Agent';
  }

  initials(name = this.lead?.fullName || ''): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2)
      .map((part) => part[0]).join('').toUpperCase() || 'L';
  }

  formatDate(value?: string): string {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';
    return new Intl.DateTimeFormat('en', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(date);
  }

  formatMoney(value?: number, currency = 'USD'): string {
    if (value === undefined || value === null || !Number.isFinite(Number(value))) {
      return 'Not set';
    }
    const normalizedCurrency = /^[A-Z]{3}$/.test(currency.toUpperCase())
      ? currency.toUpperCase()
      : 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    }).format(Number(value));
  }

  isOverdue(task: CrmTask): boolean {
    return task.status !== 'completed' && Date.parse(task.dueAt) < Date.now();
  }

  activityIcon(type: CrmLeadActivity['type']): string {
    switch (type) {
      case 'note': return 'fa-regular fa-note-sticky';
      case 'status': return 'fa-solid fa-arrow-right-arrow-left';
      case 'assignment': return 'fa-regular fa-user';
      case 'inquiry': return 'fa-regular fa-envelope';
      case 'task': return 'fa-regular fa-square-check';
      default: return 'fa-solid fa-circle-info';
    }
  }

  activityLabel(type: CrmLeadActivity['type']): string {
    switch (type) {
      case 'note': return 'Note';
      case 'status': return 'Stage changed';
      case 'assignment': return 'Assignment';
      case 'inquiry': return 'Website inquiry';
      case 'task': return 'Task update';
      default: return 'System update';
    }
  }

  identifyTask(_: number, task: CrmTask): number {
    return task.id;
  }

  identifyActivity(_: number, activity: CrmLeadActivity): number {
    return activity.id;
  }

  private populateLeadForm(lead: CrmLead): void {
    this.leadForm = {
      fullName: lead.fullName || '',
      email: lead.email || '',
      phoneNumber: lead.phoneNumber || '',
      preferredContactMethod: lead.preferredContactMethod || '',
      source: lead.source || 'manual',
      goal: lead.goal || '',
      currency: lead.currency || 'USD',
      preferences: lead.preferences || '',
      budgetMin: lead.budgetMin,
      budgetMax: lead.budgetMax,
      preferredDistricts: [...(lead.preferredDistricts || [])],
      preferredPropertyType: lead.preferredPropertyType || '',
      bedrooms: lead.bedrooms,
      apartmentId: lead.apartmentId ?? null,
    };
    this.preferredDistrictsText = (lead.preferredDistricts || []).join(', ');
  }

  private emptyLeadForm(): UpdateCrmLeadRequest {
    return {
      fullName: '',
      email: '',
      phoneNumber: '',
      source: 'manual',
      currency: 'USD',
      preferredDistricts: [],
    };
  }

  private emptyTaskForm(): TaskForm {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString().slice(0, 16);
    return { title: '', description: '', type: 'follow-up', dueAt: local };
  }

  private toIsoDate(value: string): string | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private positiveNumber(value?: number): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
  }

  private nonNegativeNumber(value?: number): number | undefined {
    if (value === undefined || value === null || String(value).trim() === '') {
      return undefined;
    }
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
  }

  private apiError(error: HttpErrorResponse, fallback: string): string {
    if (error.status === 401) return 'Your session expired. Please sign in again.';
    if (error.status === 403) return 'You do not have access to this lead.';
    if (error.status === 404) return 'This lead could not be found.';
    const message = typeof error.error === 'string'
      ? error.error
      : error.error?.message || error.error?.title;
    return message || fallback;
  }
}
