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
