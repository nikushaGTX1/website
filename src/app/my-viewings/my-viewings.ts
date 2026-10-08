import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CrmService, MyViewing } from '../services/crm.service';
import { TranslationService } from '../services/translation.service';

/** The signed-in customer's viewing requests and their status (VELVEN-027). */
@Component({
  selector: 'app-my-viewings',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-viewings.html',
  styleUrl: './my-viewings.css',
})
export class MyViewings implements OnInit {
  viewings: MyViewing[] = [];
  loading = true;
  error = '';

  constructor(
    private readonly crm: CrmService,
    private readonly translation: TranslationService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.crm.getMyViewings().subscribe({
      next: (items) => {
        this.viewings = items;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Your viewings could not be loaded. Please try again.';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  get upcoming(): MyViewing[] {
    return this.viewings.filter((item) => item.status === 'Pending');
  }

  get history(): MyViewing[] {
    return this.viewings.filter((item) => item.status !== 'Pending');
  }

  statusLabel(status: MyViewing['status']): string {
    return {
      Pending: 'Pending',
      Visited: 'Visited',
      DealDone: 'Deal done',
      Past: 'Date passed',
      Cancelled: 'Cancelled',
    }[status];
  }

  dateLabel(value: string): string {
    const language = this.translation.language$.value;
    const locale = language === 'ka' ? 'ka-GE' : language === 'ru' ? 'ru-RU' : 'en-GB';
    return new Date(value).toLocaleString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** The "Preferred time" note the form appends to the message. */
  preferredTime(item: MyViewing): string {
    return /Preferred time:\s*([^|]+)/i.exec(item.message || '')?.[1]?.trim() || '';
  }
}
