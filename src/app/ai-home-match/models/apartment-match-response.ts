import { HomeMatchResult } from './home-match-result';
export interface HomeMatchResponse {
  totalMatches: number;
  profileId?: number;
  matches: HomeMatchResult[];
}
export type HomeMatchApiResponse = HomeMatchResponse | HomeMatchResult[];
