import { LandAreaPipe } from '../../utils/land-area';
import type { LifestyleInsight } from '../../ai-home-match/services/match-explanations';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { AgentService } from '../../services/agent.service';
import { TranslationService } from '../../services/translation.service';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Apartment } from '../../models/apartment';
import { CurrencyPrice } from '../../currency-price/currency-price';
import { ListingTitlePipe } from '../../shared/listing-title.pipe';
import { FavoriteService } from '../../services/favorite.service';
import { toMediaUrl } from '../../utils/api-media';
import { isSaleListing } from '../../utils/listing-deal';
import { parkingCostLabel, parkingTypeLabel } from '../../utils/parking-cost';
import { PhotoUrlPipe } from '../../shared/photo-url.pipe';
import { listingDeposit, listingDepositInGel } from '../../utils/listing-deposit';
import { DecimalPipe } from '@angular/common';
import { hasPrivateParking } from '../../ai-home-match/services/priority-scoring';
import type { HomeMatchApartment } from '../../ai-home-match/models/home-match-result';

interface AgentContact { photo: string; phone: string }

/** Agent photos and phones by user id, fetched once for every card on the page. */
let agentPhotos$: Observable<Map<string, AgentContact>> | undefined;

/** One line under "Why it fits": lead and tail are numbers/dates kept out of translation. */
export interface FitLine { lead?: string; text: string; tail?: string; /** Why it matters to this client ("To walk your dog"). */ why?: string }

/** A listing card in Velven Discover, styled like the Saved Listings cards. */
@Component({
  selector: 'app-discover-card',
  templateUrl: './discover-card.html',
  styleUrl: './discover-card.css',
  imports: [LandAreaPipe, DecimalPipe, PhotoUrlPipe, NgIf, NgFor, RouterLink, CurrencyPrice, ListingTitlePipe],
})
export class DiscoverCard implements OnInit {
  @Input({ required: true }) apartment!: Apartment;
  /** Shows the "New match" badge (published after the search was saved, not opened yet). */
  @Input() isNew = false;
  /** Place in the Velven Match order for its search (1 = best match); same numbers as the results page. */
  @Input() rank: number | null = null;
  /** Nothing fails, but something still needs confirming with the agent (e.g. pets). */
  @Input() needsCheck = false;
  /** Shown when the home is not free by the client's move-in date ("18 December"). */
  @Input() availableFrom = '';

  /**
   * "Free from: 10 January" in the page language, split into label and date so the row
   * looks like the parking row. Georgian needs the month in its "-დან" form.
   */
  get available(): { label: string; date: string } {
    const [day, monthName] = this.availableFrom.trim().split(/\s+/);
    const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
      .indexOf((monthName || '').toLowerCase());
    const lang = typeof document === 'undefined' ? 'ka' : document.documentElement.lang;
    const known = month >= 0 && /^\d+$/.test(day);
    if (lang === 'ka') {
      const ka = ['იანვრიდან', 'თებერვლიდან', 'მარტიდან', 'აპრილიდან', 'მაისიდან', 'ივნისიდან', 'ივლისიდან', 'აგვისტოდან', 'სექტემბრიდან', 'ოქტომბრიდან', 'ნოემბრიდან', 'დეკემბრიდან'];
      return { label: 'თავისუფალია', date: known ? day + ' ' + ka[month] : this.availableFrom };
    }
    if (lang === 'ru') {
      const ru = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      return { label: 'Свободна', date: known ? 'с ' + day + ' ' + ru[month] : this.availableFrom };
    }
    return { label: 'Available', date: 'from ' + this.availableFrom };
  }
  /** Opened from an alert: briefly outlined so it is easy to find. */
  @Input() highlighted = false;
  /** Name of the saved search it matches, when the list shows several searches. */
  @Input() searchName = '';
  @Input() searchId: number | null = null;
  /** Matched a saved search: shows "Matches your must-haves". */
  @Input() matched = false;
  /** Velven Match reasons, shown as "Why it fits". */
  @Input() reasons: LifestyleInsight[] = [];
  /** Shown on the Saved homes page: "Velven Match" badge, or "About the home" for homes no search found. */
  @Input() savedView = false;
  /** Small card (property page suggestions): photo, price, title, specs and a link only. */
  @Input() compact = false;
  @Output() opened = new EventEmitter<Apartment>();
  /** Client tapped "Don't like": the home moves lower in this search (not removed). */
  @Output() notForMe = new EventEmitter<Apartment>();
  /** Client tapped "Like": the agent is notified. */
  @Output() like = new EventEmitter<Apartment>();
  @Input() liked = false;
  @Input() disliked = false;
  /** Short lift animation right after a like. */
  @Input() likePop = false;

  agentPhoto = '';
  /** Phone from the agent's Velven profile, used when the listing has none. */
  agentProfilePhone = '';

  constructor(
    readonly favorites: FavoriteService,
    private agents: AgentService,
    private translation: TranslationService,
  ) {}

  ngOnInit(): void {
    const id = this.apartment.uploadedByUserId || this.apartment.agentUserId || this.apartment.agentId;
    if (!id || !this.agentName) return;
    agentPhotos$ ??= this.agents.getAgents().pipe(
      map((list) => new Map(list.filter((a) => a.id).map((a) => [a.id!, {
        photo: toMediaUrl(a.profilePictureUrl || a.profilePicture || ''),
        phone: a.phoneNumber || '',
      }]))),
      catchError(() => of(new Map<string, AgentContact>())),
      shareReplay(1),
    );
    agentPhotos$.subscribe((agents) => {
      const agent = agents.get(id);
      this.agentPhoto = agent?.photo || '';
      this.agentProfilePhone = agent?.phone || '';
    });
  }

  get agentName(): string {
    return (this.apartment.agentName || this.apartment.uploadedByName || '').trim();
  }

  get agentFirstName(): string {
    return this.agentName.split(/\s+/)[0];
  }

  get agentInitials(): string {
    return this.agentName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  /** "Today", "Yesterday" or a short date, in the page language. */
  get postedLabel(): string {
    const value = this.apartment.publishedAt || this.apartment.createdAt;
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const language = this.translation.language$.value;
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
    if (days <= 0) return language === 'ka' ? 'დღეს' : language === 'ru' ? 'Сегодня' : 'Today';
    if (days === 1) return language === 'ka' ? 'გუშინ' : language === 'ru' ? 'Вчера' : 'Yesterday';
    return date.toLocaleDateString(language === 'ka' ? 'ka-GE' : language === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' });
  }

  /** Facts from the listing first (pets, park, availability), then Velven Match's own reasons. */
  get whyItFits(): FitLine[] {
    const lines: FitLine[] = [];
    const a = this.apartment;
    if (this.matched) {
      // Velven Match: only what fits this user, in their priority order.
      const language = this.translation.language$.value;
      const unit = language === 'ka' ? 'წთ' : language === 'ru' ? 'мин' : 'min';
      // Private parking is always one of the lines when the home has it (it replaces the third).
      const top = this.reasons.slice(0, 3);
      const parking = this.reasons.find((item) => item.title === 'Parking for your car');
      if (parking && !top.includes(parking)) top.splice(2, 1, parking);
      return top.map((item) => ({
        text: item.title,
        tail: item.meta ? '· ' + item.meta.replace('min', unit) : undefined,
        why: item.reason && item.reason !== 'One of your top priorities' ? item.reason : undefined,
      }));
    }
    if (!this.matched && a.isFurnished) lines.push({ text: 'Furnished, with appliances' });
    if (a.isPetFriendly) lines.push({ text: 'Pets accepted' });
    if (a.parkDistanceMinutes) lines.push({ lead: String(a.parkDistanceMinutes), text: 'min walk to a park' });
    // Metro only when it is a short walk (under 18 min).
    else if (a.metroDistanceMinutes && a.metroDistanceMinutes < 18) lines.push({ lead: String(a.metroDistanceMinutes), text: 'min walk to the metro' });
    if (a.availableFrom) {
      const date = new Date(a.availableFrom);
      if (!Number.isNaN(date.getTime())) {
        if (date.getTime() <= Date.now()) lines.push({ text: 'Available now' });
        else lines.push({ text: 'Available by', tail: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
      }
    }
    // Always three lines when the listing has them: fill with more facts.
    const more: FitLine[] = [];
    if (a.parkDistanceMinutes && a.metroDistanceMinutes && a.metroDistanceMinutes < 18) more.push({ lead: String(a.metroDistanceMinutes), text: 'min walk to the metro' });
    if (hasPrivateParking(a as unknown as HomeMatchApartment)) more.push({ text: 'Private parking' });
    if (a.hasBalcony) more.push({ text: 'Balcony' });
    if (a.hasElevator) more.push({ text: 'Elevator' });
    if (a.hasAirConditioning) more.push({ text: 'Air conditioning' });
    for (const line of more) if (lines.length < 3) lines.push(line);
    return lines.slice(0, 3);
  }

  /** Refundable deposit, same value as on the property page (0 = none listed). */
  get deposit(): number {
    return this.isSale ? 0 : listingDeposit(this.apartment);
  }

  get depositInGel(): boolean {
    return listingDepositInGel(this.apartment);
  }

  get photoCount(): number {
    return this.apartment.imageUrls?.length || (this.apartment.imageUrl ? 1 : 0);
  }

  get agentPhone(): string {
    return (this.apartment.agentPhoneNumber || this.agentProfilePhone || this.apartment.phoneNumber || '').replace(/[^\d+]/g, '');
  }

  get image(): string {
    return toMediaUrl(this.apartment.imageUrls?.[0] || this.apartment.imageUrl) || '/property-placeholder.svg';
  }

  get isSale(): boolean {
    return isSaleListing(this.apartment);
  }

  /** "Vake · Chavchavadze Ave" */
  get location(): string {
    return [this.apartment.district, this.apartment.street].filter(Boolean).join(' · ') || this.apartment.city || 'Tbilisi';
  }

  /** Kind of parking (garage, courtyard, street), shown before the cost. */
  get parkingType(): string {
    return parkingTypeLabel(this.apartment);
  }

  /**
   * Price next to the parking type, only when parking costs extra ("Garage · Extra $100").
   * Free parking shows just the type ("Garage"), never the word "Free".
   */
  get parkingCost(): string {
    const cost = this.apartment.hasParking ? parkingCostLabel(this.apartment) : '';
    return cost === 'Building parking' || cost === 'Free' ? '' : cost;
  }

  /** Parking row text when the type is unknown ("Extra $300", "Street parking", "Available"). */
  get parkingText(): string {
    if (!this.apartment.hasParking) return this.parkingType === 'Street parking' ? 'Street parking' : '';
    const cost = parkingCostLabel(this.apartment);
    return cost && cost !== 'Free' ? cost : 'Available';
  }

  get showParking(): boolean {
    return !!(this.parkingType || this.parkingText);
  }

  toggleFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favorites.toggleFavorite(this.apartment.id).subscribe({ error: () => undefined });
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!image.src.endsWith('/property-placeholder.svg')) image.src = '/property-placeholder.svg';
  }
}
