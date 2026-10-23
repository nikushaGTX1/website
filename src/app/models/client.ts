import { HomeMatchProfile } from '../ai-home-match/models/home-match-profile';

/** A Velven Match search saved to a client account (Velven Discover). */
export interface SavedSearch {
  id: number;
  name: string;
  profile: HomeMatchProfile;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Listings published after this count as new matches. */
  criteriaSince: string;
  /** Matches the client has not opened yet. */
  newMatches: number;
}

/** A listing published after the search was saved that meets all its must-haves. */
export interface SavedSearchMatchRecord {
  savedSearchId: number;
  apartmentId: number;
  matchedAt: string;
  seenAt: string | null;
}

export interface ClientNotificationApartment {
  id: number;
  title: string;
  description?: string;
  price: number;
  city?: string;
  district?: string;
  street?: string;
  bedrooms?: number;
  sizeSquareMeters?: number;
  imageUrl?: string | null;
}

export interface ClientNotification {
  id: number;
  type: 'match' | string;
  createdAt: string;
  readAt: string | null;
  savedSearchId: number | null;
  searchName: string | null;
  apartment: ClientNotificationApartment | null;
}

export interface ClientNotificationPage {
  items: ClientNotification[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
}

export interface ClientSummary {
  /** Unread alerts (bell badge). */
  unread: number;
  /** Matches not opened in Velven Discover yet (menu badge). */
  newMatches: number;
}

export interface ClientPreferences {
  matchAlertsInApp: boolean;
  matchAlertsEmail: boolean;
  preferredLanguage: 'ka' | 'en' | 'ru' | null;
  emailConfirmed: boolean;
}
