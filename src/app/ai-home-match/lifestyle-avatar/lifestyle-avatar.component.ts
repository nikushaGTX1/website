import { Component, Input } from '@angular/core';
import { HomeMatchProfile } from '../models/home-match-profile';
import { NgIf, NgFor } from '@angular/common';
import { findPortraitScene } from './portrait-catalog';

interface AvatarFigure {
  src: string;
  role: 'adult' | 'couple' | 'child' | 'pet';
  gender?: 'Male' | 'Female';
  primary?: boolean;
  ageGroup?: string;
}

@Component({
  selector: 'app-velven-lifestyle-avatar',
  templateUrl: './lifestyle-avatar.component.html',
  styleUrl: './lifestyle-avatar.component.css',
  imports: [NgIf, NgFor],
})
export class VelvenLifestyleAvatarComponent {
  /**
   * Profiles from other places (e.g. anonymised Clients board profiles) may leave out lists;
   * missing ones are treated as empty instead of crashing the page.
   * The defaults are filled in on the same object, not a copy: Velven Match edits its profile
   * in place (gender, pets, ...), and a copy never saw those changes.
   */
  @Input({ required: true }) set profile(value: HomeMatchProfile) {
    const profile = value ?? ({} as HomeMatchProfile);
    profile.lifestyles ??= [];
    profile.transportation ??= [];
    profile.childrenAgeGroups ??= [];
    profile.petTypes ??= [];
    profile.adults ??= 1;
    profile.children ??= 0;
    this._profile = profile;
  }
  get profile(): HomeMatchProfile {
    return this._profile;
  }
  private _profile!: HomeMatchProfile;
  @Input() showSummary = false;
  @Input() portrait = false;
  private failedPortraits = new Set<string>();

  get portraitScene(): string | null {
    if (!this.portrait) return null;
    const scene = findPortraitScene(this.profile);
    return scene && !this.failedPortraits.has(scene) ? scene : null;
  }
  onPortraitError(): void {
    const scene = this.portraitScene;
    if (scene) this.failedPortraits.add(scene);
  }

  get characterSrc(): string {
    if (this.profile.gender === 'Male') return '/images/ai-match/adult-man.webp';
    if (this.profile.gender === 'Female') return '/images/ai-match/adult-woman.webp';
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

    const man = '/images/ai-match/adult-man.webp';
    const manTwo = '/images/ai-match/adult-man-two.webp';
    const woman = '/images/ai-match/adult-woman.webp';
    const womanTwo = '/images/ai-match/adult-woman-two.webp';
    const childByAge: Record<string, string> = {
      Age0To3: '/images/ai-match/child-toddler.webp',
      Age4To6: '/images/ai-match/child-preschool.webp',
      Age7To12: '/images/ai-match/child-school.webp',
      Age13To17: '/images/ai-match/child-teen.webp',
    };
    const adult = (src: string, gender: 'Male' | 'Female', primary = false): AvatarFigure => ({
      src,
      role: 'adult',
      gender,
      primary,
    });
    // Never repeat a child character: use the age-matched asset first, then
    // fall back to the next unused one so siblings look different.
    const childPool = [
      childByAge['Age0To3'],
      childByAge['Age4To6'],
      childByAge['Age7To12'],
      childByAge['Age13To17'],
    ];
    const usedChildren = new Set<string>();
    const selectedChildren = Array.from(
      { length: Math.min(this.profile.children, 4) },
      (_, index): AvatarFigure => {
        const ageGroup = this.profile.childrenAgeGroups[index];
        const preferred = childByAge[ageGroup];
        const src =
          (preferred && !usedChildren.has(preferred) ? preferred : undefined) ??
          childPool.find((candidate) => !usedChildren.has(candidate)) ??
          childPool[index % childPool.length];
        usedChildren.add(src);
        const sizeGroup = (Object.keys(childByAge) as string[]).find(
          (key) => childByAge[key] === src,
        );
        return { src, role: 'child', ageGroup: sizeGroup };
      },
    );
    // Preserve every selected pet kind and the chosen dog size.
    const pets = this.profile.petTypes?.length
      ? this.profile.petTypes
      : this.profile.hasPet
        ? [this.profile.petType ?? 'Dog']
        : [];
    const selectedPet: AvatarFigure[] = [...new Set(pets)]
      .filter((pet) => pet !== 'None')
      .map((pet) => ({
        src: `/images/ai-match/${pet === 'Cat' ? 'cat' : pet === 'Other' ? 'pet-other' : `dog-${(this.profile.dogSize ?? 'Medium').toLowerCase()}`}.webp`,
        role: 'pet',
      }));
    const primaryWoman = this.profile.gender === 'Female';
    const selectedGenderAdults = primaryWoman
      ? [
          adult(woman, 'Female', true),
          adult(womanTwo, 'Female'),
          adult('/images/ai-match/business-woman.webp', 'Female'),
          adult('/images/ai-match/quiet-woman.webp', 'Female'),
        ]
      : [
          adult(man, 'Male', true),
          adult(manTwo, 'Male'),
          adult('/images/ai-match/business-man.webp', 'Male'),
          adult('/images/ai-match/quiet-man.webp', 'Male'),
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
      // Pair the primary character with the *secondary* look for the other
      // gender (not the plain "main man"/"main woman" pairing) so a couple
      // reads differently from two Relatives adults, which use the two
      // main characters together.
      const isPrimaryFemale = this.profile.gender === 'Female';
      return [
        adult(this.characterSrc, isPrimaryFemale ? 'Female' : 'Male', true),
        adult(isPrimaryFemale ? manTwo : womanTwo, isPrimaryFemale ? 'Male' : 'Female'),
        ...selectedPet,
      ];
    }
    const selectedAdults = availableAdults.slice(0, Math.min(Math.max(this.profile.adults, 1), 4));

    return [...selectedAdults, ...selectedChildren].slice(0, 4).concat(selectedPet);
  }

  variantFigureSrc(figure: AvatarFigure): string {
    if (figure.role !== 'adult' || !figure.primary || figure.gender !== this.profile.gender)
      return figure.src;

    const variant = this.lifestyleVariant;
    return variant ? this.variantAsset(variant, figure.gender === 'Female') : figure.src;
  }

  /**
   * The outfit comes from the first lifestyle the user picked that has one, so picking a
   * second or third option later never swaps the character they started with.
   */
  private get lifestyleVariant(): string | undefined {
    const variants: Record<string, string> = {
      Athlete: 'athlete',
      Student: 'student',
      BusinessProfessional: 'business',
      HostsGuests: 'host',
      RemoteWorker: 'remote',
      QuietLifestyle: 'quiet',
      SocialLifestyle: 'social',
      FrequentTraveler: 'traveler',
    };
    const first = this.profile.lifestyles.find((lifestyle) => variants[lifestyle]);
    return first ? variants[first] : undefined;
  }

  private variantAsset(variant: string, isWoman: boolean): string {
    return `/images/ai-match/${variant}-${isWoman ? 'woman' : 'man'}.webp`;
  }

  get wearsGymOutfit(): boolean {
    return this.lifestyleVariant === 'athlete';
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
