import { ChangeDetectorRef, Component, DestroyRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OwnerListingService } from '../../services/owner-listing.service';
import { ListingInterestService } from '../../services/listing-interest.service';

@Component({
  selector: 'app-submission-matches',
  imports: [CommonModule, RouterLink],
  templateUrl: './submission-matches.html',
  styleUrl: './submission-matches.css',
})
export class SubmissionMatches implements OnInit {
  loading = true;
  error = '';
  readonly skeletons = [1, 2, 3];
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
      }, error: () => { this.loading = false; this.error = 'Could not load the homes.'; this.cdr.markForCheck(); },
    });
  }
}
