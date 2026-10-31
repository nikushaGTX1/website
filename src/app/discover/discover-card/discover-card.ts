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

/** Agent photos by user id, fetched once for every card on the page. */
let agentPhotos$: Observable<Map<string, string>> | undefined;

/** One line under "Why it fits": lead and tail are numbers/dates kept out of translation. */
export interface FitLine { lead?: string; text: string; tail?: string }

/** A listing card in Velven Discover, styled like the Saved Listings cards. */
@Component({
  selector: 'app-discover-card',
  templateUrl: './discover-card.html',
  styleUrl: './discover-card.css',
  imports: [NgIf, NgFor, RouterLink, CurrencyPrice, ListingTitlePipe],
})
export class DiscoverCard implements OnInit {
  @Input({ required: true }) apartment!: Apartment;
  /** Shows the "New match" badge (published after the search was saved, not opened yet). */
  @Input() isNew = false;
  /** Nothing fails, but something still needs confirming with the agent (e.g. pets). */
  @Input() needsCheck = false;
  /** Opened from an alert: briefly outlined so it is easy to find. */
  @Input() highlighted = false;
  /** Name of the saved search it matches, when the list shows several searches. */
  @Input() searchName = '';
  /** Matched a saved search: shows "Matches your must-haves". */
  @Input() matched = false;
  /** Velven Match reasons, shown as "Why it fits". */
  @Input() reasons: string[] = [];
  @Output() opened = new EventEmitter<Apartment>();
  /** "Not for me": the page hides the home. */
  @Output() dismissed = new EventEmitter<Apartment>();

  agentPhoto = '';

  constructor(
    readonly favorites: FavoriteService,
    private agents: AgentService,
    private translation: TranslationService,
  ) {}

  ngOnInit(): void {
    const id = this.apartment.uploadedByUserId || this.apartment.agentUserId || this.apartment.agentId;
    if (!id || !this.agentName) return;
    agentPhotos$ ??= this.agents.getAgents().pipe(
      map((list) => new Map(list.filter((a) => a.id).map((a) => [a.id!, toMediaUrl(a.profilePictureUrl || a.profilePicture || '')]))),
      catchError(() => of(new Map<string, string>())),
      shareReplay(1),
    );
    agentPhotos$.subscribe((photos) => (this.agentPhoto = photos.get(id) || ''));
  }

  get agentName(): string {
    return (this.apartment.agentName || this.apartment.uploadedByName || '').trim();
  }

  get agentFirstName(): string {
    return this.agentName.split(/s+/)[0];
  }

  get agentInitials(): string {
    return this.agentName.split(/s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
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
