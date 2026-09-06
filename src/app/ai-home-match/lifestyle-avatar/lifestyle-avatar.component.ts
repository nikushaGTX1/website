import { Component, Input } from '@angular/core';
import { HomeMatchProfile } from '../models/home-match-profile';
@Component({
  selector: 'app-velven-lifestyle-avatar',
  standalone: false,
  templateUrl: './lifestyle-avatar.component.html',
  styleUrl: './lifestyle-avatar.component.css',
})
export class VelvenLifestyleAvatarComponent {
  @Input({ required: true }) profile!: HomeMatchProfile;
  @Input() showSummary = false;

  get characterSrc(): string {
    if (this.profile.gender === 'Male') return '/man%20offset%20fix.svg';
    if (this.profile.gender === 'Female') return '/woman%20offset%20fix.svg';
    return '';
  }

  get characterImages(): string[] {
    if (!this.characterSrc) return [];

    const man = '/man%20offset%20fix.svg';
    const manTwo = '/man%20ver%202%20offset.svg';
    const woman = '/woman%20offset%20fix.svg';
    const womanTwo = '/woman%20ver%202%20offset.svg';
    const couple = '/couple%20offset%20fix.svg';
    const child = '/daughter%20offset.svg';
    const pet = '/dog%20visual%20two.svg';
    const selectedChildren = Array(Math.min(this.profile.children, 4)).fill(child) as string[];
    const householdChildren = selectedChildren.length ? selectedChildren : [child];

    switch (this.profile.householdType) {
      case 'Couple':
        return [couple, ...selectedChildren, ...(this.profile.hasPet ? [pet] : [])];
      case 'ParentWithChildren':
        return [this.characterSrc, ...householdChildren, ...(this.profile.hasPet ? [pet] : [])];
      case 'FamilyWithChildren':
        return [couple, ...householdChildren, ...(this.profile.hasPet ? [pet] : [])];
      case 'Friends':
        return [manTwo, womanTwo, ...selectedChildren, ...(this.profile.hasPet ? [pet] : [])];
      case 'Roommates':
        return [woman, womanTwo, ...selectedChildren, ...(this.profile.hasPet ? [pet] : [])];
      case 'Relatives':
        return [man, woman, womanTwo, ...selectedChildren, ...(this.profile.hasPet ? [pet] : [])];
      case 'CorporateHousing':
        return [man, woman, manTwo, womanTwo, ...selectedChildren, ...(this.profile.hasPet ? [pet] : [])];
      default:
        return [this.characterSrc, ...selectedChildren, ...(this.profile.hasPet ? [pet] : [])];
    }
  }

  get wearsGymOutfit(): boolean {
    return (
      this.profile.lifestyles.includes('Athlete') ||
      this.profile.mainPreferences.includes('GymNearby')
    );
  }

  get adults(): unknown[] {
    return Array(Math.min(this.profile.adults, 4));
  }
  get children(): unknown[] {
    return Array(Math.min(this.profile.children, 4));
  }
  get items(): string[] {
    const result: string[] = [];
    if (this.profile.hasPet) result.push('🐾');
    if (this.profile.transportation.includes('Car')) result.push('🚗');
    if (this.profile.transportation.includes('Metro')) result.push('🚇');
    if (this.profile.lifestyles.includes('RemoteWorker')) result.push('💻');
    if (this.profile.lifestyles.includes('Athlete')) result.push('🏋️');
    if (this.profile.lifestyles.includes('BusinessProfessional')) result.push('💼');
    if (this.profile.lifestyles.includes('Student')) result.push('📚');
    if (
      this.profile.lifestyles.includes('SocialLifestyle') ||
      this.profile.lifestyles.includes('HostsGuests')
    )
      result.push('🛋️');
    return result;
  }
  get summary(): string {
    const parts = [
      this.label(this.profile.householdType),
      this.profile.children
        ? `${this.profile.children} ${this.profile.children === 1 ? 'Child' : 'Children'}`
        : '',
      ...this.profile.lifestyles.map((v) => this.label(v)),
      ...this.profile.transportation.map((v) => this.label(v)),
      this.profile.hasPet ? 'Pet' : '',
    ];
    return parts.filter(Boolean).join(' · ') || 'Your lifestyle profile';
  }
  private label(value: string): string {
    return value.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
}
