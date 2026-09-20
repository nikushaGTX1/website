import { Component, EventEmitter, Input, Output } from '@angular/core';
import { HomeMatchProfile } from '../models/home-match-profile';
import { answerLabel, answerList } from '../services/answer-labels';

interface AnswerRow {
  step: number;
  label: string;
  value: string;
}

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
  /** Emits the question step whose answer the user wants to change. */
  @Output() changeAnswer = new EventEmitter<number>();

  label(value: string | undefined | null): string {
    return value ? answerLabel(value) : 'Not specified';
  }

  list(values: string[]): string {
    return values.length ? answerList(values) : 'No preference';
  }

  /** Every answer with the question it came from, so each one can be changed on its own. */
  get answers(): AnswerRow[] {
    const p = this.profile;
    const rent = p.propertyGoal !== 'Buy';
    const rows: Array<AnswerRow | null> = [
      p.gender ? { step: 0, label: 'Gender', value: this.label(p.gender) } : null,
      p.propertyGoal ? { step: 1, label: 'Looking for', value: this.label(p.propertyGoal) } : null,
      {
        step: 2,
        label: 'Location',
        value: p.locationFlexible
          ? 'Flexible'
          : p.districts.length
            ? this.list(p.districts)
            : p.selectedMapArea
              ? 'Selected map area'
              : 'Not specified',
      },
      rent ? { step: 3, label: 'Budget', value: this.budget } : null,
      rent && p.householdType
        ? {
            step: 4,
            label: 'Household',
            value: `${this.label(p.householdType)} · ${p.adults} adult${p.adults === 1 ? '' : 's'}${
              p.children ? `, ${p.children} child${p.children === 1 ? '' : 'ren'}` : ''
            }`,
          }
        : null,
      {
        step: 6,
        label: 'Bedrooms',
        value:
          p.bedrooms === null || p.bedrooms === undefined
            ? 'Let AI decide'
            : p.bedrooms === 0
              ? 'Studio'
              : p.bedrooms >= 4
                ? '4 or more'
                : `${p.bedrooms} or more`,
      },
      rent
        ? {
            step: 7,
            label: 'Move-in',
            value:
              p.moveInTiming === 'SpecificDate' && p.moveInDate
                ? p.moveInDate
                : this.label(p.moveInTiming),
          }
        : { step: 7, label: 'Purchase timing', value: this.label(p.purchaseTiming) },
      rent ? { step: 7, label: 'Rental period', value: this.label(p.rentalDuration) } : null,
      { step: 8, label: 'Transport', value: this.list(p.transportation) },
      { step: 9, label: 'Lifestyle', value: this.list(p.lifestyles) },
      rent && p.hasPet !== null ? { step: 10, label: 'Pet', value: this.petValue } : null,
      { step: 11, label: 'Top 5 priorities', value: this.list(p.topPriorities) },
    ];
    return rows.filter((row): row is AnswerRow => !!row);
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
    const value =
      this.profile.propertyGoal === 'Rent'
        ? [
            this.profile.moveInTiming === 'SpecificDate' && this.profile.moveInDate
              ? this.profile.moveInDate
              : answerLabel(this.profile.moveInTiming),
            answerLabel(this.profile.rentalDuration),
          ]
            .filter(Boolean)
            .join(' · ')
        : answerLabel(this.profile.purchaseTiming);
    return value;
  }

  private get petValue(): string {
    if (this.profile.petType && this.profile.petType !== 'None') return this.label(this.profile.petType);
    return this.profile.hasPet ? 'Yes' : 'No';
  }
}
