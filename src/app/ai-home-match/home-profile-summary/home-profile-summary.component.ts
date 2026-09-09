import { Component, EventEmitter, Input, Output } from '@angular/core';
import { HomeMatchProfile } from '../models/home-match-profile';

interface ProfileAttribute {
  label: string;
  value: string;
  icon: string;
  left: number;
  top: number;
}

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
    return values.length ? values.map((value) => this.label(value)).join(', ') : 'No preference';
  }

  get budget(): string {
    return `${this.profile.currency} ${this.profile.budgetMin.toLocaleString()}–${this.profile.budgetMax.toLocaleString()}`;
  }

  get profileAttributes(): ProfileAttribute[] {
    const attributes = [
      this.profile.propertyGoal
        ? { label: 'Looking for', value: this.label(this.profile.propertyGoal), icon: 'fa-house' }
        : null,
      this.profile.locationFlexible || this.profile.districts.length || this.profile.selectedMapArea
        ? {
            label: 'Location',
            value: this.profile.locationFlexible
              ? 'Flexible'
              : this.profile.districts.length
                ? this.list(this.profile.districts)
                : 'Selected map area',
            icon: 'fa-location-dot',
          }
        : null,
      this.profile.propertyGoal !== 'Buy'
        ? { label: 'Budget', value: this.budget, icon: 'fa-wallet' }
        : null,
      this.profile.householdType
        ? {
            label: 'Household',
            value: `${this.profile.adults} adult${this.profile.adults === 1 ? '' : 's'}${
              this.profile.children
                ? ` · ${this.profile.children} child${this.profile.children === 1 ? '' : 'ren'}`
                : ''
            }`,
            icon: 'fa-people-roof',
          }
        : null,
      this.profile.bedrooms !== undefined
        ? {
            label: 'Bedrooms',
            value: this.profile.bedrooms === null
              ? 'Let AI decide'
              : this.profile.bedrooms === 0
                ? 'Studio'
                : String(this.profile.bedrooms),
            icon: 'fa-bed',
          }
        : null,
      this.timingValue
        ? { label: 'Timing', value: this.timingValue, icon: 'fa-calendar' }
        : null,
      this.profile.lifestyles.length
        ? { label: 'Lifestyle', value: this.list(this.profile.lifestyles), icon: 'fa-heart' }
        : null,
      this.profile.transportation.length
        ? { label: 'Transport', value: this.list(this.profile.transportation), icon: 'fa-route' }
        : null,
      this.profile.parkingAutomaticallyPrioritized
        ? { label: 'Parking', value: 'Automatically prioritized', icon: 'fa-square-parking' }
        : null,
      this.profile.propertyGoal !== 'Buy' && this.profile.hasPet !== null
        ? { label: 'Pet', value: this.petValue, icon: 'fa-paw' }
        : null,
    ].filter((attribute): attribute is Omit<ProfileAttribute, 'left' | 'top'> => !!attribute);

    return attributes.map((attribute, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / attributes.length;
      return {
        ...attribute,
        left: 50 + Math.cos(angle) * 42,
        top: 50 + Math.sin(angle) * 40,
      };
    });
  }

  private get timingValue(): string {
    return this.label(
      this.profile.propertyGoal === 'Rent'
        ? this.profile.rentalDuration
        : this.profile.purchaseTiming,
    ) === 'Not specified'
      ? ''
      : this.label(
          this.profile.propertyGoal === 'Rent'
            ? this.profile.rentalDuration
            : this.profile.purchaseTiming,
        );
  }

  private get petValue(): string {
    if (this.profile.petType && this.profile.petType !== 'None') return this.label(this.profile.petType);
    return this.profile.hasPet ? 'Yes' : 'No';
  }
}
