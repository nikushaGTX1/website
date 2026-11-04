import { ChangeDetectorRef, Component, DestroyRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OwnerListingService } from '../../services/owner-listing.service';
import { ListingInterestService } from '../../services/listing-interest.service';

@Component({
  selector: 'app-submission-matches', imports: [CommonModule, RouterLink],
  template: `<main><h1>თქვენი კლიენტებისთვის შესაბამისი ბინები</h1><p>აგენტის მიერ შემოწმებული და SEND-ით გავრცელებული ბინები.</p>
    <p *ngIf="loading">იტვირთება…</p><p *ngIf="error" role="alert">{{ error }}</p>
    <button *ngIf="error" (click)="load()">ხელახლა ცდა</button><p *ngIf="!loading && !error && !items.length">შესაბამისი ბინები ჯერ არ არის.</p>
    <article *ngFor="let item of items"><h2>კლიენტი #{{ item.clientId }}</h2><p>{{ item.data['location'] }} · {{ item.data['bedrooms'] }} საძინებელი · &#36;{{ item.data['totalPrice'] | number }}</p><small>{{ item.createdAt | date: 'dd.MM.yyyy HH:mm' }}</small><a [routerLink]="['/apartments', item.apartmentId]">ბინის ნახვა →</a></article>
    <a routerLink="/crm/owner-submissions">მესაკუთრის განაცხადები</a></main>`,
  styles: [`main{max-width:1000px;margin:auto;padding:32px 20px;color:#211832}article{margin:16px 0;padding:24px;border:1px solid #e6dff0;border-radius:16px;background:#fff}a,button{color:#451a8f;font-weight:700}article a{display:block;margin-top:16px}h1{font-size:clamp(24px,4vw,34px)}`],
})
export class SubmissionMatches implements OnInit {
  loading = true; error = '';
  items: Array<{ id: number; clientId: number; apartmentId: number; createdAt: string; data: Record<string, any> }> = [];
  constructor(private owners: OwnerListingService, private interests: ListingInterestService, private cdr: ChangeDetectorRef, private destroyRef: DestroyRef) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true; this.error = '';
    this.owners.matches().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => {
        this.items = rows.map(row => ({ ...row, data: JSON.parse(row.dataJson) })); this.loading = false;
        for (const row of rows) this.interests.markRead(row.id, 'submission-match').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
        this.cdr.markForCheck();
      }, error: () => { this.loading = false; this.error = 'ბინები ვერ ჩაიტვირთა.'; this.cdr.markForCheck(); },
    });
  }
}
