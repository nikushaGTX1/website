export interface MatchedApartment {
  id: number;
  title: string;
  description?: string;
  price: number;
  address?: string;
  imageUrl?: string;
  imageUrls?: string[];
  district?: string;
  bedrooms?: number;
  bathrooms?: number;
  sizeSquareMeters?: number;
}

export interface ApartmentMatchResult {
  apartment: MatchedApartment;
  matchScore: number;
  matchLabel?: string;
  reasons: string[];
  warnings: string[];
}

export interface ApartmentMatchesResponse {
  totalMatches: number;
  matches: ApartmentMatchResult[];
}

export type ApartmentMatchesApiResponse = ApartmentMatchesResponse | ApartmentMatchResult[];
