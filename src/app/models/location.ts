export interface ApiLocation {
  id: number;
  city: string;
  district: string;
  geometryStatus?: string;
  region: string;
  streetNames: string[];
  cityKa?: string;
  districtKa?: string;
  regionKa?: string;
  streetNamesKa?: string[];
  cityGe?: string;
  districtGe?: string;
  regionGe?: string;
  streetNamesGe?: string[];
  cityGeo?: string;
  districtGeo?: string;
  regionGeo?: string;
  streetNamesGeo?: string[];
  cityGeorgian?: string;
  districtGeorgian?: string;
  regionGeorgian?: string;
  streetNamesGeorgian?: string[];
  cityNameKa?: string;
  districtNameKa?: string;
  regionNameKa?: string;
  streetNameKa?: string[];
  streets?: Array<{
    id: number;
    english: string;
    georgian?: string | null;
    aliases?: string[];
    geometryStatus?: string;
  }>;
}

export type LocationSuggestionType = 'City' | 'Area' | 'Street';

export interface LocationSuggestion {
  id?: number;
  label: string;
  value?: string;
  aliases?: string[];
  type: LocationSuggestionType;
  city?: string;
  district?: string;
  districtValue?: string;
  region?: string;
}
