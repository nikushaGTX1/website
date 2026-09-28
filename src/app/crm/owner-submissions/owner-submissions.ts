import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { OwnerListingService, OwnerSubmission, OwnerSubmissionStatus } from '../../services/owner-listing.service';

@Component({ selector: 'app-owner-submissions', standalone: true, imports: [CommonModule, FormsModule, RouterModule], templateUrl: './owner-submissions.html', styleUrl: './owner-submissions.css' })
export class OwnerSubmissions implements OnInit {
  readonly featureLabels: Record<string, string> = { hasElevator:'Elevator',hasParking:'Parking',hasBalcony:'Balcony',hasAirConditioning:'Air conditioning',hasDishwasher:'Dishwasher',hasBathtub:'Bathtub',isFurnished:'Furnished',isPetFriendly:'Pets allowed',hasView:'View' };
  submissions: OwnerSubmission[] = []; selected?: OwnerSubmission; loading = true; saving = false; error = '';
  constructor(private service: OwnerListingService, private router: Router) {}
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.service.getSubmissions().subscribe({ next: rows => { this.submissions = rows; this.loading = false; }, error: e => { this.error = e.error?.message || 'Could not load owner submissions.'; this.loading = false; } }); }
  select(item: OwnerSubmission): void { this.service.getSubmission(item.id).subscribe({ next: row => this.selected = row, error: () => this.error = 'Could not load this submission.' }); }
  claimedFeatures(item: OwnerSubmission): string[] { return Object.keys(this.featureLabels).filter(key => item.data?.[key] === true); }
  verificationKeys(item: OwnerSubmission): string[] {
    return Object.keys(item.data || {}).filter(key => !['contactName', 'contactPhone', 'dealType', 'description'].includes(key) && item.data[key] !== '' && item.data[key] !== null && item.data[key] !== false);
  }
  verificationLabel(key: string): string { return this.featureLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase()); }
  facts(item: OwnerSubmission): Array<[string, any]> { return Object.entries(item.data || {}).filter(([key]) => !(key in this.featureLabels) && !['contactName','contactPhone'].includes(key)); }
  verify(key: string, value: boolean): void { if (!this.selected) return; this.selected.verification = { ...(this.selected.verification || {}), [key]: value }; }
  save(status?: OwnerSubmissionStatus): void { if (!this.selected || this.saving) return; this.saving = true; this.service.updateSubmission(this.selected.id, { status: status || this.selected.status, verification: this.selected.verification, agentNotes: this.selected.agentNotes || '' }).subscribe({ next: updated => { this.selected = updated; const index = this.submissions.findIndex(x => x.id === updated.id); if (index >= 0) this.submissions[index] = updated; this.saving = false; }, error: () => { this.error = 'Could not save the submission.'; this.saving = false; } }); }
  createListing(): void { if (this.selected) this.router.navigate(['/upload-apartment'], { queryParams: { owner: this.selected.id } }); }
  display(value: any): string { if (value === true) return 'Yes'; if (value === false) return 'No'; return value === null || value === '' ? '—' : String(value); }
}
