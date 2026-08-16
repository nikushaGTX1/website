export interface User {
  id?: string;
  userName: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  pin?: string;
  bio?: string;
  /** Short-lived signed Supabase URL returned by the API. */
  profilePicture?: string;
  /** Persistent Supabase object path; do not use this value as an image URL. */
  profilePicturePath?: string;
  /** Legacy API field retained for backwards compatibility. */
  profilePictureUrl?: string;
  role?: string;
  roles?: string[];
  isAgent?: boolean;
  isAdmin?: boolean;
  /** Optional CRM-specific role returned by newer API versions. */
  crmRole?: 'Manager' | 'Agent' | 'Uploader' | string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
