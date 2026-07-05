import { Injectable } from '@angular/core';
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
}

@Injectable({
  providedIn: 'root',
})
export class PendingApartmentService {
  private readonly storageKey = 'pendingApartments';
  private readonly cookieKey = 'pendingApartments';
  private readonly pendingSubject = new BehaviorSubject<PendingApartment[]>(this.readAll());

  pendingApartments$ = this.pendingSubject.asObservable();

  constructor() {
    window.addEventListener('storage', (event) => {
      if (event.key === this.storageKey) {
        this.refresh();
      }
    });
  }

  getAll(): PendingApartment[] {
    return this.pendingSubject.value;
  }

  refresh(): void {
    this.pendingSubject.next(this.readAll());
  }

  getWaiting(): PendingApartment[] {
    return this.getAll().filter((item) => item.status === 'pending');
  }

  getStorageDebug(): string {
    return `${location.origin} has ${this.getWaiting().length} pending / ${this.getAll().length} total local request(s).`;
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
    return request;
  }

  markApproved(id: string, reviewer: User | null): PendingApartment | null {
    return this.update(id, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewer?.fullName || reviewer?.userName || 'Agent',
      message: 'Your post was confirmed and published.',
    });
  }

  markDeclined(id: string, reviewer: User | null, message = 'Your post was declined.'): PendingApartment | null {
    return this.update(id, {
      status: 'declined',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewer?.fullName || reviewer?.userName || 'Agent',
      message,
    });
  }

  markPending(id: string): PendingApartment | null {
    return this.update(id, {
      status: 'pending',
      reviewedAt: undefined,
      reviewedBy: undefined,
      message: undefined,
    });
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
