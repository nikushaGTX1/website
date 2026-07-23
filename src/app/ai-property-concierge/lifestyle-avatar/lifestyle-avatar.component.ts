import { Component, Input } from '@angular/core';
import { HomePreferenceRequest } from '../models/home-preference-request';

interface AvatarItem {
  icon: string;
  label: string;
}

@Component({
  selector: 'app-lifestyle-avatar',
  standalone: false,
  templateUrl: './lifestyle-avatar.component.html',
  styleUrl: './lifestyle-avatar.component.css',
})
export class LifestyleAvatarComponent {
  @Input({ required: true }) preferences!: HomePreferenceRequest;

  get companions(): string[] {
    if (this.preferences.householdType === 'Family') return ['🧑', '🧒'];
    if (['Couple', 'Friends'].includes(this.preferences.householdType)) return ['🧑'];
    return [];
  }

  get items(): AvatarItem[] {
    const items: AvatarItem[] = [];
    const mapping: Record<string, AvatarItem> = {
      Dog: { icon: '🐕', label: 'Dog' },
      Cat: { icon: '🐈', label: 'Cat' },
      Other: { icon: '🐾', label: 'Pet' },
      RemoteWorker: { icon: '💻', label: 'Remote Worker' },
      Athlete: { icon: '🏋️', label: 'Athlete' },
      BusinessProfessional: { icon: '💼', label: 'Business Professional' },
      Student: { icon: '📚', label: 'Student' },
      Artist: { icon: '🎨', label: 'Artist' },
      FamilyFocused: { icon: '🏡', label: 'Family Focused' },
      Car: { icon: '🚗', label: 'Car' },
      Metro: { icon: '🚇', label: 'Metro' },
      Walking: { icon: '🚶', label: 'Walking' },
      Taxi: { icon: '🚕', label: 'Taxi' },
    };
    [...this.preferences.pets, ...this.preferences.lifestyles, this.preferences.transportation]
      .filter(Boolean)
      .forEach((key) => {
        if (mapping[key]) items.push(mapping[key]);
      });
    return items;
  }

  get summary(): string {
    const household = this.preferences.householdType;
    const labels = this.items.map((item) => item.label);
    return [household, ...labels].filter(Boolean).join(' · ') || 'Your lifestyle takes shape here';
  }
}
