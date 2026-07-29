import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { CreateApartment } from '../models/apartment';
import { User } from '../models/user';

export type PendingApartmentStatus = 'pending' | 'approved' | 'declined';

export interface PendingApartment {
  id: string;
  apartment: CreateApartment;
  status: PendingApartmentStatus;
  submittedAt: string;
  submittedByUserId?: string;
  submittedByName: string;
  submittedByEmail: string;
  reviewedAt?: string;
  reviewedBy?: string;
  message?: string;
  publishedApartmentId?: number;
}

@Injectable({
  providedIn: 'root',
})
export class PendingApartmentService {
  private readonly apiUrl = '/api/approval-requests';
  private readonly storageKey = 'pendingApartments';
  private readonly cookieKey = 'pendingApartments';
  private readonly pendingSubject = new BehaviorSubject<PendingApartment[]>(this.readAll());

  pendingApartments$ = this.pendingSubject.asObservable();

  constructor(private http: HttpClient) {
    window.addEventListener('storage', (event) => {
      if (event.key === this.storageKey) {
        this.refresh();
      }
    });
    this.refresh();
  }

  getAll(): PendingApartment[] {
    return this.pendingSubject.value;
  }

  refresh(): void {
    const localItems = this.readAll();
    this.pendingSubject.next(localItems);
    this.http.get<PendingApartment[]>(this.apiUrl).subscribe({
      next: (remoteItems) => this.save(this.merge(remoteItems, localItems)),
      error: () => {
        // Retain the local copy while offline or when the user is signed out.
      },
    });
  }

  getWaiting(): PendingApartment[] {
    return this.getAll().filter((item) => item.status === 'pending');
  }

  getStorageDebug(): string {
    return `${this.getWaiting().length} pending / ${this.getAll().length} total approval request(s).`;
  }

  getForUser(user: User | null): PendingApartment[] {
    if (!user) {
      return [];
    }

    return this.getAll().filter((item) => {
      const userId = user.id || '';
      return (
        (!!userId && item.submittedByUserId === userId) ||
        item.submittedByEmail.toLowerCase() === user.email.toLowerCase()
      );
    });
  }

  submit(apartment: CreateApartment, user: User | null): PendingApartment {
    const request: PendingApartment = {
      id: this.createId(),
      apartment,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      submittedByUserId: user?.id,
      submittedByName: user?.fullName || user?.userName || 'Guest user',
      submittedByEmail: user?.email || '',
    };

    this.save([request, ...this.getAll()]);
    this.http.post<PendingApartment>(this.apiUrl, request).subscribe({
      next: (savedRequest) => {
        const withoutTemporary = this.getAll().filter((item) => item.id !== request.id);
        this.save([savedRequest, ...withoutTemporary]);
      },
      error: () => {
        // The local request remains visible and can be retried after reconnecting.
      },
    });
    return request;
  }

  markApproved(
    id: string,
    reviewer: User | null,
    publishedApartmentId?: number,
  ): PendingApartment | null {
    const changes: Partial<PendingApartment> = {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewer?.fullName || reviewer?.userName || 'Agent',
      message: 'Your post was confirmed and published.',
      publishedApartmentId,
    };
    const updated = this.update(id, changes);
    this.syncReview(id, changes);
    return updated;
  }

  markDeclined(id: string, reviewer: User | null, message = 'Your post was declined.'): PendingApartment | null {
    const changes: Partial<PendingApartment> = {
      status: 'declined',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewer?.fullName || reviewer?.userName || 'Agent',
      message,
    };
    const updated = this.update(id, changes);
    this.syncReview(id, changes);
    return updated;
  }

  markPending(id: string): PendingApartment | null {
    const changes: Partial<PendingApartment> = {
      status: 'pending',
      reviewedAt: undefined,
      reviewedBy: undefined,
      message: undefined,
      publishedApartmentId: undefined,
    };
    const updated = this.update(id, changes);
    this.syncReview(id, changes);
    return updated;
  }

  updateSubmission(id: string, apartment: CreateApartment): PendingApartment | null {
    return this.update(id, {
      apartment,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      reviewedAt: undefined,
      reviewedBy: undefined,
      message: 'Changes saved. Waiting for agent approval.',
      publishedApartmentId: undefined,
    });
  }

  remove(id: string): boolean {
    const items = this.getAll();
    const updated = items.filter((item) => item.id !== id);

    if (updated.length === items.length) {
      return false;
    }

    this.save(updated);
    return true;
  }

  private update(id: string, changes: Partial<PendingApartment>): PendingApartment | null {
    let updatedItem: PendingApartment | null = null;
    const updated = this.getAll().map((item) => {
      if (item.id !== id) {
        return item;
      }

      updatedItem = { ...item, ...changes };
      return updatedItem;
    });

    this.save(updated);
    return updatedItem;
  }

  private save(items: PendingApartment[]): void {
    const serialized = JSON.stringify(items);
    localStorage.setItem(this.storageKey, serialized);
    this.writeCookie(serialized);
    this.pendingSubject.next(items);
  }

  private syncReview(id: string, changes: Partial<PendingApartment>): void {
    this.http.patch<PendingApartment>(`${this.apiUrl}/${encodeURIComponent(id)}`, changes).subscribe({
      next: (remoteItem) => {
        this.save(this.getAll().map((item) => item.id === id ? remoteItem : item));
      },
      error: () => {
        // Keep the optimistic local status; the admin can retry the action.
      },
    });
  }

  private merge(remoteItems: PendingApartment[], localItems: PendingApartment[]): PendingApartment[] {
    const items = new Map<string, PendingApartment>();
    for (const item of localItems) items.set(item.id, item);
    for (const item of remoteItems) items.set(item.id, item);
    return [...items.values()].sort(
      (left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt),
    );
  }

  private readAll(): PendingApartment[] {
    const raw = localStorage.getItem(this.storageKey) || this.readCookie();
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as PendingApartment[];
      if (Array.isArray(parsed)) {
        localStorage.setItem(this.storageKey, JSON.stringify(parsed));
        return parsed;
      }

      return [];
    } catch {
      return [];
    }
  }

  private writeCookie(value: string): void {
    if (value.length > 3500) {
      document.cookie = `${this.cookieKey}=; path=/; max-age=0; SameSite=Lax`;
      return;
    }

    document.cookie = `${this.cookieKey}=${encodeURIComponent(value)}; path=/; max-age=2592000; SameSite=Lax`;
  }

  private readCookie(): string {
    const cookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${this.cookieKey}=`));

    return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
  }

  private createId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
