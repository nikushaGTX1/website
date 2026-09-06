export const CRM_LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'viewing',
  'negotiation',
  'won',
  'lost',
] as const;

export type CrmLeadStatus = (typeof CRM_LEAD_STATUSES)[number];

export const CRM_TASK_TYPES = ['follow-up', 'call', 'viewing', 'email'] as const;
export type CrmTaskType = (typeof CRM_TASK_TYPES)[number];
export type CrmTaskStatus = 'open' | 'completed';

export type CrmActivityType =
  | 'note'
  | 'status'
  | 'assignment'
  | 'inquiry'
  | 'task'
  | 'system';

export type CrmManualActivityType = 'note' | 'inquiry' | 'task';

export interface CrmLeadActivity {
  id: number;
  leadId?: number;
  type: CrmActivityType;
  body: string;
  createdAt: string;
  createdById?: string;
  createdByName?: string;
}

export interface CrmTask {
  id: number;
  leadId?: number;
  title: string;
  description?: string;
  type: CrmTaskType;
  status: CrmTaskStatus;
  dueAt: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  completedAt?: string;
  createdAt?: string;
}

export interface CrmLead {
  id: number;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  preferredContactMethod?: 'phone' | 'email' | 'whatsapp' | string;
  source: string;
  status: CrmLeadStatus;
  goal?: string;
  currency?: string;
  preferences?: string;
  message?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredDistricts?: string[];
  preferredPropertyType?: string;
  rooms?: number;
  bedrooms?: number;
  apartmentId?: number;
  apartmentTitle?: string;
  requestedViewingAt?: string;
  nextFollowUpAt?: string;
  nextTask?: CrmTask | null;
  lastActivityAt?: string;
  consentGiven?: boolean;
  consentGivenAt?: string;
  customerUserId?: string;
  createdByUserId?: string;
  /** Account that uploaded the property which generated this lead. */
  uploaderUserId?: string;
  /** Original owner, independent of the currently assigned agent. */
  originalOwnerUserId?: string;
  originalOwnerName?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt?: string;
  activities?: CrmLeadActivity[];
  tasks?: CrmTask[];
}

export interface CrmMetrics {
  totalLeads: number;
  newLeads: number;
  activeLeads: number;
  overdueTasks: number;
  upcomingViewings: number;
  wonLeads: number;
  conversionRate: number;
}

export interface CrmLeadFilters {
  search?: string;
  status?: CrmLeadStatus;
  source?: string;
  assignedAgentId?: string;
}

export interface CreateCrmLeadRequest {
  fullName: string;
  email?: string;
  phoneNumber?: string;
  preferredContactMethod?: string;
  source: string;
  status?: CrmLeadStatus;
  goal?: string;
  currency?: string;
  preferences?: string;
  message?: string;
  requestedViewingAt?: string;
  assignedAgentId?: string | null;
  budgetMin?: number;
  budgetMax?: number;
  preferredDistricts?: string[];
  preferredPropertyType?: string;
  rooms?: number;
  bedrooms?: number;
  apartmentId?: number;
}

export interface UpdateCrmLeadRequest {
  fullName: string;
  email?: string;
  phoneNumber?: string;
  preferredContactMethod?: string;
  source: string;
  goal?: string;
  currency?: string;
  preferences?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredDistricts?: string[];
  preferredPropertyType?: string;
  rooms?: number;
  bedrooms?: number;
  apartmentId?: number | null;
}

export interface CreateCrmActivityRequest {
  body: string;
  type: CrmManualActivityType;
}

export interface CreateCrmTaskRequest {
  title: string;
  description?: string;
  type: CrmTaskType;
  dueAt: string;
  assignedAgentId?: string | null;
}

export interface UpdateCrmTaskRequest {
  title?: string;
  description?: string;
  type?: CrmTaskType;
  dueAt?: string;
  status?: CrmTaskStatus;
}

export interface CrmInquiryRequest {
  apartmentId?: number;
  name: string;
  email?: string;
  phone?: string;
  requestedViewingAt?: string;
  message?: string;
  consentToContact: boolean;
  website?: string;
}

export interface CrmInquiryResponse {
  received: boolean;
}
