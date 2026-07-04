export interface User {
  id?: string;
  userName: string;
  fullName: string;
  email: string;
  pin?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
