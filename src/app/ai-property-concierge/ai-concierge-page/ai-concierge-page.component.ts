import { ChangeDetectorRef, Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AiConciergeService } from '../services/ai-concierge.service';
import { ApartmentMatchResult } from '../models/apartment-match-result';
import { ConciergeOption, ConciergeQuestion } from '../models/concierge-question';
import { HomePreferenceRequest } from '../models/home-preference-request';

type PreferenceKey =
  | 'districts'
  | 'householdType'
  | 'bedrooms'
  | 'pets'
  | 'lifestyles'
  | 'transportation'
  | 'mustHaves'
  | 'preferredStyle';
@Component({
  selector: 'app-ai-concierge-page',
  standalone: false,
  templateUrl: './ai-concierge-page.component.html',
  styleUrl: './ai-concierge-page.component.css',
})
export class AiConciergePageComponent {
  readonly questions: ConciergeQuestion[] = [
    {
      title: 'Where would you like to live?',
      hint: 'Choose one or more districts.',
      options: this.opts(
        ['Vake', 'Saburtalo', 'Vera', 'Mtatsminda', 'Didi Dighomi', 'Anywhere'],
        ['🏛️', '🌳', '☕', '⛰️', '🏘️', '✨'],
      ),
    },
    {
      title: 'Who will live in the apartment?',
      options: this.opts(['Just me', 'Couple', 'Family', 'Friends'], ['🧑', '💑', '👨‍👩‍👧', '🧑‍🤝‍🧑']),
    },
    {
      title: 'How many bedrooms do you need?',
      options: [
        { label: 'Studio', value: '0', icon: '▣' },
        { label: '1 Bedroom', value: '1', icon: '1' },
        { label: '2 Bedrooms', value: '2', icon: '2' },
        { label: '3 Bedrooms', value: '3', icon: '3' },
        { label: '4+ Bedrooms', value: '4', icon: '4+' },
      ],
    },
    {
      title: 'Do you have pets?',
      hint: 'Select all that apply.',
      options: this.opts(['Dog', 'Cat', 'Other', 'No pets'], ['🐕', '🐈', '🐾', '—']),
    },
    {
      title: 'Which lifestyle describes you best?',
      hint: 'Choose up to two.',
      options: this.opts(
        [
          'Remote Worker',
          'Athlete',
          'Business Professional',
          'Student',
          'Artist',
          'Family Focused',
        ],
        ['💻', '🏋️', '💼', '📚', '🎨', '🏡'],
      ),
    },
    {
      title: 'How do you usually get around?',
      options: this.opts(['Walking', 'Metro', 'Car', 'Taxi'], ['🚶', '🚇', '🚗', '🚕']),
    },
    { title: 'What is your monthly budget?', hint: 'Set a comfortable monthly range in USD.' },
    {
      title: 'What does your ideal apartment need?',
      hint: 'Select features, then mark each as must-have or nice-to-have.',
      options: this.opts(
        [
          'Balcony',
          'Parking',
          'Elevator',
          'Air Conditioning',
          'Dishwasher',
          'Bathtub',
          'Pet Friendly',
          'Home Office Space',
          'Large Kitchen',
          'View',
          'Furnished',
        ],
        ['🌿', '🅿️', '↕', '❄️', '🍽️', '🛁', '🐾', '💻', '👩‍🍳', '🌇', '🛋️'],
      ),
    },
    {
      title: 'Which apartment style do you prefer?',
      options: this.opts(
        ['Modern', 'Luxury', 'Minimal', 'Classic', 'Industrial', 'No preference'],
        ['◫', '◆', '○', '🏛️', '⚙️', '✨'],
      ),
    },
  ];
  currentStep = 0;
  loading = false;
  submitted = false;
  errorMessage = '';
  matches: ApartmentMatchResult[] = [];
  preferences: HomePreferenceRequest = {
    districts: [],
    householdType: '',
    bedrooms: -1,
    pets: [],
    lifestyles: [],
    transportation: '',
    needsParking: false,
    budgetMin: 800,
    budgetMax: 1600,
    mustHaves: [],
    niceToHaves: [],
  };
  budgetForm = new FormGroup({
    min: new FormControl(800, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    max: new FormControl(1600, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
  });
  constructor(
    private service: AiConciergeService,
    private cdr: ChangeDetectorRef,
  ) {}
  get question() {
    return this.questions[this.currentStep];
  }
  get progress() {
    return ((this.currentStep + 1) / this.questions.length) * 100;
  }
  private opts(labels: string[], icons: string[] = []): ConciergeOption[] {
    return labels.map((label, i) => ({ label, value: this.enumValue(label), icon: icons[i] }));
  }
  private enumValue(label: string): string {
    return label
      .replace(/\+/g, '')
      .replace(/\s+(Sun|pets|preference|Bedrooms?|Have)$/i, '')
      .replace(/\s/g, '');
  }
  select(option: ConciergeOption): void {
    const maps: PreferenceKey[] = [
      'districts',
      'householdType',
      'bedrooms',
      'pets',
      'lifestyles',
      'transportation',
      'mustHaves',
      'preferredStyle',
    ];
    const key = maps[this.currentStep];
    if (!key) return;
    if (key === 'districts' || key === 'pets' || key === 'lifestyles') {
      this.toggleArray(key, option.value);
      return;
    }
    if (key === 'mustHaves') {
      this.toggleFeature(option.value);
      return;
    }
    if (key === 'bedrooms') this.preferences.bedrooms = Number(option.value);
    else if (key === 'householdType') this.preferences.householdType = option.label;
    else if (key === 'transportation') {
      this.preferences.transportation = option.value;
      this.preferences.needsParking = option.value === 'Car';
    } else this.preferences.preferredStyle = option.value;
  }
  private toggleArray(key: 'districts' | 'pets' | 'lifestyles', value: string): void {
    const exclusive = key === 'districts' ? 'Anywhere' : key === 'pets' ? 'No' : null;
    let values = this.preferences[key];
    if (value === exclusive) values = values.includes(value) ? [] : [value];
    else {
      values = values.filter((v) => v !== exclusive);
      values = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      if (key === 'lifestyles' && values.length > 2) values = values.slice(1);
    }
    this.preferences[key] = values;
  }
  toggleFeature(value: string): void {
    if (
      this.preferences.mustHaves.includes(value) ||
      this.preferences.niceToHaves.includes(value)
    ) {
      this.preferences.mustHaves = this.preferences.mustHaves.filter((v) => v !== value);
      this.preferences.niceToHaves = this.preferences.niceToHaves.filter((v) => v !== value);
    } else this.preferences.mustHaves = [...this.preferences.mustHaves, value];
  }
  featureLevel(value: string): 'must' | 'nice' | '' {
    return this.preferences.mustHaves.includes(value)
      ? 'must'
      : this.preferences.niceToHaves.includes(value)
        ? 'nice'
        : '';
  }
  setFeatureLevel(value: string, event: Event): void {
    event.stopPropagation();
    const level = (event.target as HTMLSelectElement).value;
    this.preferences.mustHaves = this.preferences.mustHaves.filter((v) => v !== value);
    this.preferences.niceToHaves = this.preferences.niceToHaves.filter((v) => v !== value);
    if (level === 'must') this.preferences.mustHaves.push(value);
    if (level === 'nice') this.preferences.niceToHaves.push(value);
  }
  selected(option: ConciergeOption): boolean {
    switch (this.currentStep) {
      case 0:
        return this.preferences.districts.includes(option.value);
      case 1:
        return this.preferences.householdType === option.label;
      case 2:
        return this.preferences.bedrooms === Number(option.value);
      case 3:
        return this.preferences.pets.includes(option.value);
      case 4:
        return this.preferences.lifestyles.includes(option.value);
      case 5:
        return this.preferences.transportation === option.value;
      case 7:
        return !!this.featureLevel(option.value);
      case 8:
        return this.preferences.preferredStyle === option.value;
      default:
        return false;
    }
  }

  canContinue(): boolean {
    switch (this.currentStep) {
      case 0:
        return !!this.preferences.districts.length;
      case 1:
        return !!this.preferences.householdType;
      case 2:
        return this.preferences.bedrooms >= 0;
      case 3:
        return !!this.preferences.pets.length;
      case 4:
        return !!this.preferences.lifestyles.length;
      case 5:
        return (
          !!this.preferences.transportation &&
          (this.preferences.transportation !== 'Metro' || !!this.preferences.metroDistanceMinutes)
        );
      case 6:
        return (
          this.budgetForm.valid &&
          this.budgetForm.controls.max.value >= this.budgetForm.controls.min.value
        );
      case 8:
        return !!this.preferences.preferredStyle;
      default:
        return true;
    }
  }
  continue(): void {
    if (!this.canContinue()) return;
    if (this.currentStep === 6) {
      this.preferences.budgetMin = this.budgetForm.controls.min.value;
      this.preferences.budgetMax = this.budgetForm.controls.max.value;
    }
    if (this.currentStep < this.questions.length - 1) {
      this.currentStep++;
      return;
    }
    this.submit();
  }
  back(): void {
    if (this.currentStep > 0) this.currentStep--;
  }
  submit(): void {
    this.loading = true;
    this.errorMessage = '';
    this.service
      .findMatches(this.preferences)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (r) => {
          this.matches = (Array.isArray(r) ? r : r.matches).sort(
            (a, b) => b.matchScore - a.matchScore,
          );
          this.submitted = true;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: () =>
          (this.errorMessage = 'We could not fetch your matches right now. Please try again.'),
      });
  }
  adjust(): void {
    this.submitted = false;
    this.currentStep = 0;
    this.errorMessage = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
