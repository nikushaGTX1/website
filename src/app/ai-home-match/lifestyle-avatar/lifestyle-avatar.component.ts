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
    if (this.profile.gender === 'Male') return '/Characters/mtavari kaci.png';
    if (this.profile.gender === 'Female') return '/Characters/მთავარი ქალი.png';
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

    const man = '/Characters/mtavari kaci.png';
    const manTwo = '/Characters/მეორე კაცი.png';
    const woman = '/Characters/მთავარი ქალი.png';
    const womanTwo = '/Characters/მეორე ქალი.png';
    const childAssets = [
      '/Characters/ყველაზე პატარა ბავშვი.png',
      '/Characters/საშუალო ბავშვი.png',
      '/Characters/მოზრდილი ბავშვი.png',
      '/Characters/ყველაზე დიდი ბავშვი.png',
    ];
    const childByAge: Record<string, string> = {
      Age0To3: childAssets[0],
      Age4To6: childAssets[1],
      Age7To12: childAssets[2],
      Age13To17: childAssets[3],
    };
    const adult = (src: string, gender: 'Male' | 'Female', primary = false): AvatarFigure => ({
      src,
      role: 'adult',
      gender,
      primary,
    });
    const selectedChildren = Array.from({ length: Math.min(this.profile.children, 4) }, (_, index): AvatarFigure => ({
      src: childByAge[this.profile.childrenAgeGroups[index]] || childAssets[index],
      role: 'child',
    }));
    const selectedPet: AvatarFigure[] = this.profile.hasPet
      ? [{ src: this.profile.petType === 'Cat' ? '/Characters/კატა.png' : '/Characters/ძაღლი.png', role: 'pet' }]
      : [];
    const primaryWoman = this.profile.gender === 'Female';
    const selectedGenderAdults = primaryWoman
      ? [
          adult(woman, 'Female', true),
          adult(womanTwo, 'Female'),
          adult('/Characters/ბიზნესმენი ქალი.png', 'Female'),
          adult('/Characters/მშვიდი ცხოვრება ქალი.png', 'Female'),
        ]
      : [
          adult(man, 'Male', true),
          adult(manTwo, 'Male'),
          adult('/Characters/ბიზნესმენი კაცი.png', 'Male'),
          adult('/Characters/მშვიდი ცხოვრება კაცი.png', 'Male'),
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
    if (lifestyles.has('RemoteWorker')) return this.variantAsset('remote', isWoman);
    if (lifestyles.has('QuietLifestyle')) return this.variantAsset('quiet', isWoman);

    return figure.src;
  }

  private variantAsset(variant: string, isWoman: boolean): string {
    const variants: Record<string, [string, string]> = {
      athlete: ['სპორცმენი კაცი.png', 'სპორცმენი ქალი.png'],
      student: ['სტუდენტი ბიჭი.png', 'სტუდენტი გოგო.png'],
      business: ['ბიზნესმენი კაცი.png', 'ბიზნესმენი ქალი.png'],
      host: ['სტუმართ მოყვარე კაცი.png', 'სტუმართ მოყვარე ქალი.png'],
      remote: ['სახლიდან მომუშავე კაცი.png', 'სახლიდან მომუშავე ქალი.png'],
      quiet: ['მშვიდი ცხოვრება კაცი.png', 'მშვიდი ცხოვრება ქალი.png'],
    };
    const asset = variants[variant] || variants['quiet'];
    return `/Characters/${asset[isWoman ? 1 : 0]}`;
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
