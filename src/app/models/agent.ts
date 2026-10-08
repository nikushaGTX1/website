export interface Agent {
  id?: string;
  userId?: string;
  userName?: string;
  fullName?: string;
  name?: string;
  email?: string;
  bio?: string;
  location?: string;
  phoneNumber?: string;
  /** Short-lived signed Supabase URL returned by the API. */
  profilePicture?: string;
  /** Persistent Supabase object path; not directly displayable. */
  profilePicturePath?: string;
  profilePictureUrl?: string;
  avatarUrl?: string;
  rating?: number;
  averageRating?: number;
  ratingCount?: number;
  /** Won CRM deals assigned to the agent; same number on the directory and the profile. */
  closedDeals?: number;
  /** The agent's own published listings. */
  listingCount?: number;
}
