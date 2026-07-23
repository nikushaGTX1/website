import { Injectable } from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export interface NearbyWalkingTimes {
  schoolDistanceMinutes?: number;
  kindergartenDistanceMinutes?: number;
  groceryDistanceMinutes?: number;
  gymDistanceMinutes?: number;
  metroDistanceMinutes?: number;
  parkDistanceMinutes?: number;
  universityDistanceMinutes?: number;
  pharmacyDistanceMinutes?: number;
}

export interface NearestSchoolResult {
  nearest_school_name: string;
  nearest_school_walk_minutes: number;
  nearest_school_distance_meters: number;
}

type NearbyTimeKey = keyof NearbyWalkingTimes;

@Injectable({ providedIn: 'root' })
export class GoogleNearbyTimeService {
  private configured = false;
  private readonly cache = new Map<string, Promise<NearbyWalkingTimes>>();

  getWalkingTimes(address: string): Promise<NearbyWalkingTimes> {
    const key = address.trim().toLowerCase();
    if (!key) return Promise.resolve({});

    const cached = this.cache.get(key);
    if (cached) return cached;

    const request = this.loadWalkingTimes(address);
    this.cache.set(key, request);
    return request;
  }

  /**
   * Finds the school with the shortest actual pedestrian route. A null result
   * means Places returned no schools, or none of the candidates had a walking route.
   */
  async getNearestSchool(
    propertyCoordinates: google.maps.LatLng | google.maps.LatLngLiteral,
  ): Promise<NearestSchoolResult | null> {
    this.configure();

    const [
      { Place, SearchNearbyRankPreference, SearchByTextRankPreference },
      { DistanceMatrixService, TravelMode },
    ] = await Promise.all([
      importLibrary('places') as Promise<google.maps.PlacesLibrary>,
      importLibrary('routes') as Promise<google.maps.RoutesLibrary>,
    ]);

    const responses = await Promise.all(
      ['primary_school', 'secondary_school', 'school'].map((schoolType) =>
        Place.searchNearby({
          fields: [
            'id',
            'displayName',
            'primaryType',
            'types',
            'location',
            'formattedAddress',
            'businessStatus',
          ],
          locationRestriction: { center: propertyCoordinates, radius: 10000 },
          includedTypes: [schoolType],
          maxResultCount: 20,
          rankPreference: SearchNearbyRankPreference.DISTANCE,
        }),
      ),
    );
    const nearbyCandidates = responses.flatMap((response) => response.places);
    const privateFallbackIds = new Set<string>();
    let fallbackCandidates: google.maps.places.Place[] = [];
    if (nearbyCandidates.filter((place) => this.isEligibleSchool(place)).length < 10) {
      const fallbackResponses = await Promise.all(
        ['საჯარო სკოლა', 'კერძო სკოლა', 'public school', 'private school', 'school'].map(
          (textQuery) =>
            Place.searchByText({
              textQuery,
              fields: [
                'id',
                'displayName',
                'primaryType',
                'types',
                'location',
                'formattedAddress',
                'businessStatus',
              ],
              locationBias: { center: propertyCoordinates, radius: 10000 },
              maxResultCount: 20,
              rankPreference: SearchByTextRankPreference.DISTANCE,
            }),
        ),
      );
      fallbackResponses.forEach((response, index) => {
        if (index === 1 || index === 3) {
          response.places.forEach((place) => {
            if (place.id) privateFallbackIds.add(place.id);
          });
        }
      });
      fallbackCandidates = fallbackResponses.flatMap((response) => response.places);
    }

    // A place can match more than one requested type. Prefer the stable place ID,
    // with name + coordinates as a defensive fallback when an ID is unavailable.
    const uniqueSchools = new Map<string, google.maps.places.Place>();
    for (const school of [...nearbyCandidates, ...fallbackCandidates]) {
      if (
        !school.location ||
        !this.isEligibleSchool(school, !!school.id && privateFallbackIds.has(school.id))
      )
        continue;
      uniqueSchools.set(this.schoolDedupeKey(school), school);
    }

    const originLatitude =
      typeof propertyCoordinates.lat === 'function'
        ? propertyCoordinates.lat()
        : propertyCoordinates.lat;
    const originLongitude =
      typeof propertyCoordinates.lng === 'function'
        ? propertyCoordinates.lng()
        : propertyCoordinates.lng;
    const schools = [...uniqueSchools.values()]
      .sort((a, b) => {
        const aLocation = a.location!;
        const bLocation = b.location!;
        const aDistance =
          (aLocation.lat() - originLatitude) ** 2 + (aLocation.lng() - originLongitude) ** 2;
        const bDistance =
          (bLocation.lat() - originLatitude) ** 2 + (bLocation.lng() - originLongitude) ** 2;
        return aDistance - bDistance;
      })
      .slice(0, 10);
    if (!schools.length) return null;

    const matrix = await new DistanceMatrixService().getDistanceMatrix({
      origins: [propertyCoordinates],
      destinations: schools.map((school) => school.location!),
      travelMode: TravelMode.WALKING,
    });
    const routes = matrix.rows[0]?.elements || [];

    let nearest:
      | { school: google.maps.places.Place; durationSeconds: number; distanceMeters: number }
      | undefined;

    routes.forEach((route, index) => {
      // NOT_FOUND and ZERO_RESULTS have no duration/distance and are skipped.
      if (route.status !== 'OK' || !route.duration || !route.distance) return;
      if (route.duration.value > 20 * 60) return;
      const candidate = {
        school: schools[index],
        durationSeconds: route.duration.value,
        distanceMeters: route.distance.value,
      };
      if (
        !nearest ||
        candidate.durationSeconds < nearest.durationSeconds ||
        (candidate.durationSeconds === nearest.durationSeconds &&
          candidate.distanceMeters < nearest.distanceMeters)
      ) {
        nearest = candidate;
      }
    });

    if (!nearest) return null;
    return {
      nearest_school_name: nearest.school.displayName || 'Unnamed school',
      nearest_school_walk_minutes: Math.max(1, Math.round(nearest.durationSeconds / 60)),
      nearest_school_distance_meters: nearest.distanceMeters,
    };
  }

  private async loadWalkingTimes(address: string): Promise<NearbyWalkingTimes> {
    this.configure();

    const [{ Geocoder }, { Place, SearchNearbyRankPreference }, routes] = await Promise.all([
      importLibrary('geocoding') as Promise<google.maps.GeocodingLibrary>,
      importLibrary('places') as Promise<google.maps.PlacesLibrary>,
      importLibrary('routes') as Promise<google.maps.RoutesLibrary>,
    ]);

    const geocoding = await new Geocoder().geocode({ address: `${address}, Georgia` });
    const origin = geocoding.results[0]?.geometry.location;
    if (!origin) return {};

    const categories: Array<{ type: string; key: NearbyTimeKey }> = [
      { type: 'preschool', key: 'kindergartenDistanceMinutes' },
      { type: 'supermarket', key: 'groceryDistanceMinutes' },
      { type: 'gym', key: 'gymDistanceMinutes' },
      { type: 'subway_station', key: 'metroDistanceMinutes' },
      { type: 'park', key: 'parkDistanceMinutes' },
      { type: 'university', key: 'universityDistanceMinutes' },
      { type: 'pharmacy', key: 'pharmacyDistanceMinutes' },
    ];

    const [nearestSchool, entries] = await Promise.all([
      this.getNearestSchool(origin).catch(() => null),
      Promise.all(
        categories.map(async ({ type, key }) => {
          try {
            const response = await Place.searchNearby({
              fields: ['location'],
              locationRestriction: { center: origin, radius: 5000 },
              includedPrimaryTypes: [type],
              maxResultCount: 1,
              rankPreference: SearchNearbyRankPreference.DISTANCE,
            });
            const destination = response.places[0]?.location;
            if (!destination) return [key, undefined] as const;

            const directions = await new routes.DirectionsService().route({
              origin,
              destination,
              travelMode: routes.TravelMode.WALKING,
            });
            const seconds = directions.routes[0]?.legs[0]?.duration?.value;
            return [key, seconds ? Math.max(1, Math.round(seconds / 60)) : undefined] as const;
          } catch {
            return [key, undefined] as const;
          }
        }),
      ),
    ]);

    const walkingTimes = Object.fromEntries(
      entries.filter((entry) => entry[1] !== undefined),
    ) as NearbyWalkingTimes;
    if (nearestSchool) {
      walkingTimes.schoolDistanceMinutes = nearestSchool.nearest_school_walk_minutes;
    }
    return walkingTimes;
  }

  private configure(): void {
    if (this.configured) return;
    const apiKey = document
      .querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')
      ?.content.trim();
    if (!apiKey) throw new Error('Google Maps API key is not configured.');
    setOptions({ key: apiKey, v: 'weekly' });
    this.configured = true;
  }

  private isEligibleSchool(place: google.maps.places.Place, privateSearchMatch = false): boolean {
    const name = place.displayName?.toLocaleLowerCase() || '';
    const excluded =
      place.types?.includes('driving_school') === true ||
      place.types?.includes('preschool') === true ||
      name.includes('ავტოსკოლ') ||
      name.includes('autoschool') ||
      name.includes('auto school') ||
      name.includes('driving school') ||
      name.includes('მართვის სკოლ') ||
      name.includes('автошкол') ||
      name.includes('ბაღი') ||
      name.includes('საბავშვო ბაღ') ||
      name.includes('ბაგა-ბაღ') ||
      name.includes('kindergarten') ||
      name.includes('kindergarden') ||
      name.includes('preschool') ||
      name.includes('pre-school') ||
      name.includes('nursery') ||
      name.includes('детский сад') ||
      name.includes('детсад') ||
      name.includes('language school') ||
      name.includes('ენების სკოლ') ||
      name.includes('dance school') ||
      name.includes('ცეკვის სკოლ') ||
      name.includes('music school') ||
      name.includes('სამუსიკო სკოლ') ||
      name.includes('art school') ||
      name.includes('სასწავლო ცენტ') ||
      name.includes('training center') ||
      name.includes('vocational') ||
      name.includes('პროფესიულ');
    if (excluded) return false;

    const hasSchoolName = name.includes('school') || name.includes('სკოლ') || name.includes('школ');
    const hasSchoolNumber = /(?:№|#)\s*\d+|\bn\s*\.?\s*\d+/iu.test(name);
    const isPrivateSchool =
      name.includes('კერძო სკოლ') ||
      name.includes('private school') ||
      name.includes('частная школа');
    const isSecondarySchool =
      name.includes('secondary school') ||
      name.includes('საშუალო სკოლ') ||
      name.includes('средняя школа');
    return (
      (privateSearchMatch && place.types?.includes('school') === true) ||
      (hasSchoolName && (hasSchoolNumber || isPrivateSchool || isSecondarySchool))
    );
  }

  private schoolDedupeKey(place: google.maps.places.Place): string {
    const normalizedName = (place.displayName || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[№#\s.,'"`’_-]+/gu, '');
    return normalizedName || place.id || crypto.randomUUID();
  }
}
