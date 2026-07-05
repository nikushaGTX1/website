export interface Apartment {
  id: number;
  title: string;
  description: string;
  price: number;
  address?: string;
  imageUrl?: string;
  imageUrls?: string[];
  createdAt: string;
  userId?: string;
  ownerId?: string;
  createdById?: string;
  applicationUserId?: string;
  createdByEmail?: string;
  userEmail?: string;
}

export interface CreateApartment {
  title: string;
  description: string;
  price: number;
  address?: string;
  imageUrl?: string;
  imageUrls?: string[];
}
