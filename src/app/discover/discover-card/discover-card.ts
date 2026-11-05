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
import { parkingCostLabel } from '../../utils/parking-cost';
import { PhotoUrlPipe } from '../../shared/photo-url.pipe';
import { listingDeposit, listingDepositInGel } from '../../utils/listing-deposit';
import { DecimalPipe } from '@angular/common';

interface AgentContact { photo: string; phone: string }

/** Agent photos and phones by user id, fetched once for every card on the page. */
let agentPhotos$: Observable<Map<string, AgentContact>> | undefined;

/** One line under "Why it fits": lead and tail are numbers/dates kept out of translation. */
export interface FitLine { lead?: string; text: string; tail?: string }

/** A listing card in Velven Discover, styled like the Saved Listings cards. */
@Component({
  selector: 'app-discover-card',
  templateUrl: './discover-card.html',
  styleUrl: './discover-card.css',
  imports: [DecimalPipe, PhotoUrlPipe, NgIf, NgFor, RouterLink, CurrencyPrice, ListingTitlePipe],
})
export class DiscoverCard implements OnInit {
  @Input({ required: true }) apartment!: Apartment;
  /** Shows the "New match" badge (published after the search was saved, not opened yet). */
  @Input() isNew = false;
  /** Place in the Velven Match order for its search (1 = best match); same numbers as the results page. */
  @Input() rank: number | null = null;
  /** Nothing fails, but something still needs confirming with the agent (e.g. pets). */
  @Input() needsCheck = false;
  /** Opened from an alert: briefly outlined so it is easy to find. */
  @Input() highlighted = false;
  /** Name of the saved search it matches, when the list shows several searches. */
  @Input() searchName = '';
  @Input() searchId: number | null = null;
  /** Matched a saved search: shows "Matches your must-haves". */
  @Input() matched = false;
  /** Velven Match reasons, shown as "Why it fits". */
  @Input() reasons: string[] = [];
  /** Shown on the Saved homes page: "Velven Match" badge, or "About the home" for homes no search found. */
  @Input() savedView = false;
  /** Small card (property page suggestions): photo, price, title, specs and a link only. */
  @Input() compact = false;
  @Output() opened = new EventEmitter<Apartment>();
  /** Client tapped "Not for me": the list hides this home. */
  @Output() notForMe = new EventEmitter<Apartment>();

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
    if (!this.matched && a.isFurnished) lines.push({ text: 'Furnished, with appliances' });
    if (a.isPetFriendly) lines.push({ text: 'Pets accepted' });
    if (a.parkDistanceMinutes) lines.push({ lead: String(a.parkDistanceMinutes), text: 'min walk to a park' });
    else if (a.metroDistanceMinutes) lines.push({ lead: String(a.metroDistanceMinutes), text: 'min walk to the metro' });
    if (a.availableFrom) {
      const date = new Date(a.availableFrom);
      if (!Number.isNaN(date.getTime())) {
        if (date.getTime() <= Date.now()) lines.push({ text: 'Available now' });
        else lines.push({ text: 'Available by', tail: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
      }
    }
    for (const reason of this.reasons) if (lines.length < 3) lines.push({ text: reason });
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

  get parkingText(): string {
    if (!this.apartment.hasParking) return 'Not included';
    return parkingCostLabel(this.apartment) || 'Included';
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
