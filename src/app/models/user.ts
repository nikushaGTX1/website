export interface User {
  id?: string;
  userName: string;
  fullName: string;
  email: string;
  pin?: string;
  bio?: string;
  profilePicture?: string;
  profilePictureUrl?: string;
  role?: string;
  roles?: string[];
  isAgent?: boolean;
  isAdmin?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}
