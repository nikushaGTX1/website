import { Component, EventEmitter, Input, Output } from '@angular/core';
import { HomeMatchProfile } from '../models/home-match-profile';
@Component({
  selector: 'app-home-profile-summary',
  standalone: false,
  templateUrl: './home-profile-summary.component.html',
  styleUrl: './home-profile-summary.component.css',
})
export class HomeProfileSummaryComponent {
  @Input({ required: true }) profile!: HomeMatchProfile;
  @Input() saving = false;
  @Input() saveMessage = '';
  @Output() submitProfile = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  label(value: string | undefined | null): string {
    return value ? value.replace(/([a-z])([A-Z])/g, '$1 $2') : 'Not specified';
  }
  list(values: string[]): string {
    return values.length ? values.map((v) => this.label(v)).join(', ') : 'No preference';
  }
  get budget(): string {
    return `${this.profile.currency} ${this.profile.budgetMin.toLocaleString()}–${this.profile.budgetMax.toLocaleString()}`;
  }
}
