export interface Apartment {
  id: number;
  title: string;
  description: string;
  price: number;
  address?: string;
  imageUrl?: string;
  createdAt: string;
}

export interface CreateApartment {
  title: string;
  description: string;
  price: number;
  address?: string;
  imageUrl?: string;
}