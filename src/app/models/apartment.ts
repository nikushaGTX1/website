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
  agentId?: string;
  agentUserId?: string;
  uploadedById?: string;
  createdByEmail?: string;
  userEmail?: string;
  agentEmail?: string;
  uploadedByEmail?: string;
  agentName?: string;
  uploadedByName?: string;
  ownerName?: string;
  agentProfilePictureUrl?: string;
  uploaderProfilePictureUrl?: string;
}

export interface CreateApartment {
  title: string;
  description: string;
  price: number;
  address?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageFile?: File;
}
