import { Component, Input } from '@angular/core';
import { HomeMatchProfile } from '../models/home-match-profile';

interface AvatarFigure {
  src: string;
  role: 'adult' | 'child' | 'pet';
}

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
    return this.characterFigures.map((figure) => figure.src);
  }

  get characterFigures(): AvatarFigure[] {
    if (!this.characterSrc) return [];

    const man = '/man%20offset%20fix.svg';
    const manTwo = '/man%20ver%202%20offset.svg';
    const woman = '/woman%20offset%20fix.svg';
    const womanTwo = '/woman%20ver%202%20offset.svg';
    const couple = '/couple%20offset%20fix.svg';
    const child = '/daughter%20offset.svg';
    const pet = '/dog%20visual%20two.svg';
    const adult = (src: string): AvatarFigure => ({ src, role: 'adult' });
    const selectedChildren = Array.from(
      { length: Math.min(this.profile.children, 4) },
      (): AvatarFigure => ({ src: child, role: 'child' }),
    );
    const householdChildren = selectedChildren.length
      ? selectedChildren
      : [{ src: child, role: 'child' } as AvatarFigure];
    const selectedPet: AvatarFigure[] = this.profile.hasPet ? [{ src: pet, role: 'pet' }] : [];

    switch (this.profile.householdType) {
      case 'Couple':
        return [adult(couple), ...selectedChildren, ...selectedPet];
      case 'ParentWithChildren':
        return [adult(this.characterSrc), ...householdChildren, ...selectedPet];
      case 'FamilyWithChildren':
        return [adult(couple), ...householdChildren, ...selectedPet];
      case 'Friends':
        return [adult(manTwo), adult(womanTwo), ...selectedChildren, ...selectedPet];
      case 'Roommates':
        return [adult(woman), adult(womanTwo), ...selectedChildren, ...selectedPet];
      case 'Relatives':
        return [adult(man), adult(woman), adult(womanTwo), ...selectedChildren, ...selectedPet];
      case 'CorporateHousing':
        return [adult(man), adult(woman), adult(manTwo), adult(womanTwo), ...selectedChildren, ...selectedPet];
      default:
        return [adult(this.characterSrc), ...selectedChildren, ...selectedPet];
    }
  }

  variantFigureSrc(figure: AvatarFigure): string {
    if (figure.role !== 'adult') return figure.src;

    const isCouple = figure.src.includes('couple');
    const isWoman = figure.src.includes('woman');
    const lifestyles = new Set(this.profile.lifestyles);

    if (this.wearsGymOutfit) return this.variantAsset('athlete', isCouple, isWoman);
    if (lifestyles.has('Student')) return this.variantAsset('student', isCouple, isWoman);
    if (lifestyles.has('BusinessProfessional')) return this.variantAsset('business', isCouple, isWoman);
    if (lifestyles.has('HostsGuests')) return this.variantAsset('host', isCouple, isWoman);
    if (lifestyles.has('FrequentTraveler')) return this.variantAsset('traveler', isCouple, isWoman);

    return figure.src;
  }

  private variantAsset(variant: string, isCouple: boolean, isWoman: boolean): string {
    const subject = isCouple ? 'couple' : isWoman ? 'woman' : 'man';
    return `/avatar-${variant}-${subject}-v1.png`;
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
