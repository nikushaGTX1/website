import { Component, Input } from '@angular/core';
import { HomeMatchProfile } from '../models/home-match-profile';

interface AvatarFigure {
  src: string;
  role: 'adult' | 'couple' | 'child' | 'pet';
  gender?: 'Male' | 'Female';
  primary?: boolean;
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

  get extraPeople(): number {
    return Math.max(0, this.profile.adults + this.profile.children - 4);
  }

  get characterFigures(): AvatarFigure[] {
    if (!this.characterSrc) return [];

    const man = '/man%20offset%20fix.svg';
    const manTwo = '/man%20ver%202%20offset.svg';
    const manThree = '/man%20ver%203%20offset.svg';
    const woman = '/woman%20offset%20fix.svg';
    const womanTwo = '/woman%20ver%202%20offset.svg';
    const child = '/daughter%20offset.svg';
    const pet = '/dog%20visual%20two.svg';
    const adult = (src: string, gender: 'Male' | 'Female', primary = false): AvatarFigure => ({
      src,
      role: 'adult',
      gender,
      primary,
    });
    const selectedChildren = Array.from(
      { length: Math.min(this.profile.children, 4) },
      (): AvatarFigure => ({ src: child, role: 'child' }),
    );
    const selectedPet: AvatarFigure[] = this.profile.hasPet ? [{ src: pet, role: 'pet' }] : [];
    const primaryWoman = this.profile.gender === 'Female';
    const selectedGenderAdults = primaryWoman
      ? [
          adult(woman, 'Female', true),
          adult(womanTwo, 'Female'),
          adult('/avatar-business-woman-v1.png', 'Female'),
          adult('/avatar-traveler-woman-v1.png', 'Female'),
        ]
      : [
          adult(man, 'Male', true),
          adult(manTwo, 'Male'),
          adult(manThree, 'Male'),
          adult('/avatar-business-man-v1.png', 'Male'),
        ];
    const mixedAdults = primaryWoman
      ? [
          adult(woman, 'Female', true),
          adult(man, 'Male'),
          adult(womanTwo, 'Female'),
          adult(manTwo, 'Male'),
        ]
      : [
          adult(man, 'Male', true),
          adult(woman, 'Female'),
          adult(manTwo, 'Male'),
          adult(womanTwo, 'Female'),
        ];
    const availableAdults = [
      'Couple',
      'FamilyWithChildren',
      'Relatives',
      'Roommates',
      'CorporateHousing',
    ].includes(this.profile.householdType)
      ? mixedAdults
      : selectedGenderAdults;
    if (this.profile.householdType === 'Couple') {
      return [
        adult(this.characterSrc, this.profile.gender === 'Female' ? 'Female' : 'Male', true),
        adult(
          this.profile.gender === 'Female' ? man : woman,
          this.profile.gender === 'Female' ? 'Male' : 'Female',
        ),
        ...selectedPet,
      ];
    }
    const selectedAdults = availableAdults.slice(0, Math.min(Math.max(this.profile.adults, 1), 4));

    return [...selectedAdults, ...selectedChildren].slice(0, 4).concat(selectedPet);
  }

  variantFigureSrc(figure: AvatarFigure): string {
    if (figure.role !== 'adult' || !figure.primary || figure.gender !== this.profile.gender) return figure.src;

    const isWoman = figure.gender === 'Female';
    const lifestyles = new Set(this.profile.lifestyles);

    if (this.wearsGymOutfit) return this.variantAsset('athlete', isWoman);
    if (lifestyles.has('Student')) return this.variantAsset('student', isWoman);
    if (lifestyles.has('BusinessProfessional')) return this.variantAsset('business', isWoman);
    if (lifestyles.has('HostsGuests')) return this.variantAsset('host', isWoman);
    if (lifestyles.has('FrequentTraveler')) return this.variantAsset('traveler', isWoman);

    return figure.src;
  }

  private variantAsset(variant: string, isWoman: boolean): string {
    const subject = isWoman ? 'woman' : 'man';
    return `/avatar-${variant}-${subject}-v1.png`;
  }

  get wearsGymOutfit(): boolean {
    return this.profile.lifestyles.includes('Athlete');
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
