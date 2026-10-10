import { Component, EventEmitter, Input, Output } from '@angular/core';
import { HomeMatchProfile } from '../models/home-match-profile';
import { answerLabel, answerList } from '../services/answer-labels';

interface AnswerRow {
  step: number;
  label: string;
  value: string;
  icon: string;
}

interface ProfileAttribute {
  step: number;
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
      p.gender ? { step: 0, label: 'Gender', value: this.label(p.gender), icon: 'fa-venus-mars' } : null,
      p.propertyGoal ? { step: 1, label: 'Looking for', value: this.label(p.propertyGoal), icon: 'fa-house' } : null,
      p.apartmentStyle ? { step: 12, label: 'Apartment style', value: p.apartmentStyle === 'Other' ? 'Something else' : p.apartmentStyle, icon: 'fa-couch' } : null,
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
        icon: 'fa-location-dot',
      },
      rent ? { step: 3, label: 'Budget', value: this.budget, icon: 'fa-wallet' } : null,
      rent && p.householdType
        ? {
            step: 4,
            label: 'Household',
            value: `${this.label(p.householdType)} · ${p.adults} adult${p.adults === 1 ? '' : 's'}${
              p.children ? `, ${p.children} child${p.children === 1 ? '' : 'ren'}` : ''
            }`,
            icon: 'fa-people-roof',
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
        icon: 'fa-bed',
      },
      rent
        ? {
            step: 7,
            label: 'Move-in',
            value:
              p.moveInTiming === 'SpecificDate' && p.moveInDate
                ? p.moveInDate
                : this.label(p.moveInTiming),
            icon: 'fa-calendar-days',
          }
        : { step: 7, label: 'Purchase timing', value: this.label(p.purchaseTiming), icon: 'fa-calendar-days' },
      rent ? { step: 7, label: 'Rental period', value: this.label(p.rentalDuration), icon: 'fa-hourglass-half' } : null,
      { step: 8, label: 'Transport', value: this.list(p.transportation), icon: 'fa-route' },
      p.transportation.includes('Car') && p.carFuelType
        ? { step: 8, label: 'Car', value: this.label(p.carFuelType), icon: p.carFuelType === 'Electric' ? 'fa-charging-station' : 'fa-gas-pump' }
        : null,
      { step: 9, label: 'Lifestyle', value: this.list(p.lifestyles), icon: 'fa-heart' },
      rent && p.hasPet !== null ? { step: 10, label: 'Pet', value: this.petValue, icon: 'fa-paw' } : null,
      { step: 11, label: 'Top 5 priorities', value: this.list(p.topPriorities), icon: 'fa-list-ol' },
    ];
    return rows.filter((row): row is AnswerRow => !!row);
  }

  get budget(): string {
    return `${this.profile.currency} ${this.profile.budgetMin.toLocaleString()}–${this.profile.budgetMax.toLocaleString()}`;
  }

  get profileAttributes(): ProfileAttribute[] {
    const attributes = [
      this.profile.propertyGoal
        ? { step: 1, label: 'Looking for', value: this.label(this.profile.propertyGoal), icon: 'fa-house' }
        : null,
      this.profile.locationFlexible || this.profile.districts.length || this.profile.selectedMapArea
        ? {
            step: 2,
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
        ? { step: 3, label: 'Budget', value: this.budget, icon: 'fa-wallet' }
        : null,
      this.profile.householdType
        ? {
            step: 4,
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
            step: 6,
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
        ? { step: 7, label: 'Timing', value: this.timingValue, icon: 'fa-calendar' }
        : null,
      this.profile.lifestyles.length
        ? { step: 9, label: 'Lifestyle', value: this.list(this.profile.lifestyles), icon: 'fa-heart' }
        : null,
      this.profile.transportation.length
        ? { step: 8, label: 'Transport', value: this.list(this.profile.transportation), icon: 'fa-route' }
        : null,
      this.profile.parkingAutomaticallyPrioritized
        ? { step: 8, label: 'Parking', value: 'Automatically prioritized', icon: 'fa-square-parking' }
        : null,
      this.profile.propertyGoal !== 'Buy' && this.profile.hasPet !== null
        ? { step: 10, label: 'Pet', value: this.petValue, icon: 'fa-paw' }
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

  /** Answers not shown on the desktop orbit; mobile lists them so every answer stays editable. */
  get mobileExtraAttributes(): Array<Omit<ProfileAttribute, 'left' | 'top'>> {
    return [
      this.profile.gender
        ? { step: 0, label: 'Gender', value: this.label(this.profile.gender), icon: 'fa-venus-mars' }
        : null,
      { step: 11, label: 'Top 5 priorities', value: this.list(this.profile.topPriorities), icon: 'fa-list-ol' },
    ].filter((attribute): attribute is Omit<ProfileAttribute, 'left' | 'top'> => !!attribute);
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
    if (this.profile.petType === 'None' || this.profile.hasPet === false) return 'No';
    const pets = this.profile.petTypes?.length
      ? this.profile.petTypes
      : this.profile.petType
        ? [this.profile.petType]
        : [];
    if (!pets.length) return this.profile.hasPet ? 'Yes' : 'No';
    return pets
      .map((pet) =>
        pet === 'Dog' && this.profile.dogSize
          ? `${this.label('Dog')} (${this.label(this.profile.dogSize)})`
          : this.label(pet),
      )
      .join(', ');
  }
}
