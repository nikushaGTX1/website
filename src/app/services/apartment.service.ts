import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { concat, EMPTY, Observable, of } from 'rxjs';
import { catchError, expand, map, reduce, shareReplay, tap } from 'rxjs/operators';
import { Apartment, CreateApartment } from '../models/apartment';
import { API_URL } from '../utils/api-config';
import { toMediaUrl } from '../utils/api-media';

interface ApartmentMutationResponse {
  message: string;
  apartment?: Apartment;
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
  areaName?: string;
  streetId?: number;
  streetName?: string;
  searchMode?: 'rent' | 'buy';
  propertyType?: string;
  budget?: number;
  bedrooms?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApartmentService {
  private apiUrl = `${API_URL}/Apartments`;
  private apartmentsCache$?: Observable<Apartment[]>;
  private apartmentsCacheCreatedAt = 0;
  private readonly apartmentsCacheLifetimeMs = 5 * 60 * 1000;
  // v2 invalidates entries where an expired signed URL was persisted as the SVG
  // placeholder by older clients.
  private readonly persistedApartmentsKey = 'white-tower-apartments-cache-v2';
  private readonly persistedApartmentsLifetimeMs = 15 * 60 * 1000;

  constructor(private http: HttpClient) {}

  getApartments(): Observable<Apartment[]> {
    const cacheExpired =
      Date.now() - this.apartmentsCacheCreatedAt >= this.apartmentsCacheLifetimeMs;

    if (!this.apartmentsCache$ || cacheExpired) {
      const persistedApartments = this.readPersistedApartments();
      this.apartmentsCacheCreatedAt = Date.now();
      const pageSize = 100;
      const networkRequest$ = this.http
        .get<Apartment[]>(this.apiUrl, {
          params: { page: 1, pageSize },
        })
        .pipe(
          expand((page, index) =>
            page.length === pageSize
              ? this.http.get<Apartment[]>(this.apiUrl, {
                  params: { page: index + 2, pageSize },
                })
              : EMPTY,
          ),
          reduce((all, page) => [...all, ...page], [] as Apartment[]),
          map((apartments) => apartments.map((apartment) => this.normalizeImages(apartment))),
          tap((apartments) => this.persistApartments(apartments)),
          catchError((error) => {
            if (persistedApartments) {
              return EMPTY;
            }
            throw error;
          }),
        );

      this.apartmentsCache$ = (
        persistedApartments
          ? concat(of(persistedApartments), networkRequest$)
          : networkRequest$
      ).pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }

    return this.apartmentsCache$;
  }

  getApartment(id: number): Observable<Apartment> {
    const persistedApartment = this.readPersistedApartments()?.find(
      (apartment) => apartment.id === id,
    );
    return this.http.get<Apartment>(`${this.apiUrl}/${id}`).pipe(
      map((apartment) => this.normalizeImages(apartment)),
      tap((apartment) => this.persistApartment(apartment)),
      catchError((error) => {
        if (persistedApartment) {
          return of(this.normalizeImages(persistedApartment));
        }
        throw error;
      }),
    );
  }

  getApartmentsByStreetId(streetId: number): Observable<Apartment[]> {
    const pageSize = 100;
    return this.http.get<Apartment[]>(this.apiUrl, {
      params: { page: 1, pageSize, street_id: streetId },
    }).pipe(
      expand((page, index) => page.length === pageSize
        ? this.http.get<Apartment[]>(this.apiUrl, {
            params: { page: index + 2, pageSize, street_id: streetId },
          })
        : EMPTY),
      reduce((all, page) => [...all, ...page], [] as Apartment[]),
      map((apartments) => apartments.map((apartment) => this.normalizeImages(apartment)),
    ));
  }

  getApartmentsWithinArea(polygon: GeoJsonPolygon): Observable<Apartment[]> {
    return this.http
      .post<Apartment[]>(`${API_URL}/apartments/within-area`, {
        type: 'Feature',
        properties: { areaName: polygon.areaName || undefined },
        geometry: {
          type: polygon.type,
          coordinates: polygon.coordinates,
        },
      })
      .pipe(
        map((apartments) => apartments.map((apartment) => this.normalizeImages(apartment))),
        catchError(() => this.getApartments().pipe(
          map((apartments) => apartments.filter((apartment) => {
            const latitude = Number(apartment.propertyLatitude ?? apartment.latitude);
            const longitude = Number(apartment.propertyLongitude ?? apartment.longitude);
            return Number.isFinite(latitude)
              && Number.isFinite(longitude)
              && this.pointInsidePolygon(longitude, latitude, polygon.coordinates);
          })),
        )),
      );
  }

  private pointInsidePolygon(longitude: number, latitude: number, coordinates: number[][][]): boolean {
    const insideRing = (ring: number[][]): boolean => {
      let inside = false;
      for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
        const [currentX, currentY] = ring[current];
        const [previousX, previousY] = ring[previous];
        const crosses = (currentY > latitude) !== (previousY > latitude)
          && longitude < ((previousX - currentX) * (latitude - currentY)) / (previousY - currentY) + currentX;
        if (crosses) inside = !inside;
      }
      return inside;
    };
    return !!coordinates[0] && insideRing(coordinates[0])
      && coordinates.slice(1).every((hole) => !insideRing(hole));
  }

  createApartment(data: CreateApartment): Observable<ApartmentMutationResponse> {
    return this.http
      .post<ApartmentMutationResponse>(this.apiUrl, this.toApartmentFormData(data))
      .pipe(tap(() => this.clearApartmentCache()));
  }

  updateApartment(id: number, data: Partial<CreateApartment>): Observable<ApartmentMutationResponse> {
    return this.http
      .put<ApartmentMutationResponse>(`${this.apiUrl}/${id}`, this.toApartmentFormData(data))
      .pipe(tap(() => this.clearApartmentCache()));
  }

  deleteApartment(id: number): Observable<{ message: string }> {
    return this.http
      .delete<{ message: string }>(`${this.apiUrl}/${id}`)
      .pipe(tap(() => this.clearApartmentCache()));
  }

  private clearApartmentCache(): void {
    this.apartmentsCache$ = undefined;
    this.apartmentsCacheCreatedAt = 0;
    localStorage.removeItem(this.persistedApartmentsKey);
  }

  private readPersistedApartments(): Apartment[] | null {
    try {
      const rawCache = localStorage.getItem(this.persistedApartmentsKey);
      if (!rawCache) {
        return null;
      }

      const cache = JSON.parse(rawCache) as { savedAt: number; apartments: Apartment[] };
      if (
        !Array.isArray(cache.apartments) ||
        Date.now() - cache.savedAt >= this.persistedApartmentsLifetimeMs
      ) {
        localStorage.removeItem(this.persistedApartmentsKey);
        return null;
      }

      // Media links are signed and can expire while the persisted listing cache is
      // still present. Re-normalize cached entries so stale links are discarded and
      // replaced by the fresh network response instead of rendering a fake photo.
      return cache.apartments.map((apartment) => this.normalizeImages(apartment));
    } catch {
      localStorage.removeItem(this.persistedApartmentsKey);
      return null;
    }
  }

  private persistApartments(apartments: Apartment[]): void {
    localStorage.setItem(
      this.persistedApartmentsKey,
      JSON.stringify({ savedAt: Date.now(), apartments }),
    );
  }

  private persistApartment(apartment: Apartment): void {
    const apartments = this.readPersistedApartments() || [];
    const apartmentIndex = apartments.findIndex((item) => item.id === apartment.id);

    if (apartmentIndex >= 0) {
      apartments[apartmentIndex] = apartment;
    } else {
      apartments.unshift(apartment);
    }

    this.persistApartments(apartments);
  }

  private normalizeImages(apartment: Apartment): Apartment {
    const gallery = [...(apartment.images || [])]
      .sort(
        (left, right) =>
          Number(right.isCover) - Number(left.isCover) ||
          (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
      )
      .map((image) => ({
        ...image,
        url: toMediaUrl(image.url || image.storagePath) || undefined,
      }));
    const galleryUrls = gallery
      .map((image) => image.url)
      .filter((image): image is string => !!image);
    const legacyUrls = (apartment.imageUrls || [])
      .map((image) => toMediaUrl(image))
      .filter((image): image is string => !!image);
    const imageUrl =
      galleryUrls[0] || toMediaUrl(apartment.imageUrl) || legacyUrls[0] || undefined;

    return {
      ...apartment,
      imageUrl,
      imageUrls: galleryUrls.length ? galleryUrls : legacyUrls,
      images: gallery,
    };
  }

  private toApartmentFormData(data: Partial<CreateApartment>): FormData {
    const formData = new FormData();

    if (data.uploadedByUserId !== undefined) {
      formData.append('UploadedByUserId', data.uploadedByUserId || '');
    }

    if (data.title !== undefined) {
      formData.append('Title', data.title);
    }

    if (data.description !== undefined) {
      formData.append('Description', data.description);
    }

    if (data.price !== undefined) {
      formData.append('Price', String(data.price));
    }

    if (data.address !== undefined) {
      formData.append('Address', data.address || '');
    }

    if (data.phoneNumber !== undefined) {
      formData.append('PhoneNumber', data.phoneNumber || '');
    }

    if (data.ownerName !== undefined) formData.append('OwnerName', data.ownerName || '');
    if (data.ownerPhoneNumber !== undefined) formData.append('OwnerPhoneNumber', data.ownerPhoneNumber || '');
    if (data.agentName !== undefined) formData.append('AgentName', data.agentName || '');
    if (data.agentPhoneNumber !== undefined) formData.append('AgentPhoneNumber', data.agentPhoneNumber || '');

    const textFields: Array<[keyof CreateApartment, string]> = [
      ['city', 'City'],
      ['region', 'Region'],
      ['district', 'District'],
      ['street', 'Street'],
      ['buildingNumber', 'BuildingNumber'],
      ['apartmentStyle', 'ApartmentStyle'],
    ];
    const numberFields: Array<[keyof CreateApartment, string]> = [
      ['latitude', 'Latitude'],
      ['longitude', 'Longitude'],
      ['streetId', 'StreetId'],
      ['propertyLatitude', 'PropertyLatitude'],
      ['propertyLongitude', 'PropertyLongitude'],
      ['bedrooms', 'Bedrooms'],
      ['bathrooms', 'Bathrooms'],
      ['sizeSquareMeters', 'SizeSquareMeters'],
      ['floor', 'Floor'],
      ['totalFloors', 'TotalFloors'],
      ['metroDistanceMinutes', 'MetroDistanceMinutes'],
      ['gymDistanceMinutes', 'GymDistanceMinutes'],
      ['parkDistanceMinutes', 'ParkDistanceMinutes'],
      ['schoolDistanceMinutes', 'SchoolDistanceMinutes'],
      ['kindergartenDistanceMinutes', 'KindergartenDistanceMinutes'],
      ['universityDistanceMinutes', 'UniversityDistanceMinutes'],
    ];
    const booleanFields: Array<[keyof CreateApartment, string]> = [
      ['hasElevator', 'HasElevator'],
      ['hasParking', 'HasParking'],
      ['hasBalcony', 'HasBalcony'],
      ['hasBathtub', 'HasBathtub'],
      ['hasAirConditioning', 'HasAirConditioning'],
      ['hasDishwasher', 'HasDishwasher'],
      ['isPetFriendly', 'IsPetFriendly'],
      ['hasHomeOfficeSpace', 'HasHomeOfficeSpace'],
      ['hasLargeKitchen', 'HasLargeKitchen'],
      ['hasView', 'HasView'],
      ['isFurnished', 'IsFurnished'],
    ];

    [...textFields, ...numberFields, ...booleanFields].forEach(([key, apiName]) => {
      const value = data[key];
      if (value !== undefined) {
        formData.append(apiName, String(value));
      }
    });

    const images = this.getApartmentImages(data).slice(0, 15);

    if (images.length) {
      images.forEach((image) => {
        formData.append('Images', image, image.name);
      });
    }

    return formData;
  }

  private dataUrlToFile(value?: string, fileName = 'apartment-image.jpg'): File | null {
    if (!value?.startsWith('data:image/')) {
      return null;
    }

    const [metadata, base64Data] = value.split(',');
    const mimeType = metadata.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binary = atob(base64Data || '');
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], fileName, { type: mimeType });
  }

  private getApartmentImages(data: Partial<CreateApartment>): File[] {
    if (data.imageFiles?.length) {
      return data.imageFiles;
    }

    const dataUrlImages = (data.imageUrls || [])
      .map((image, index) => this.dataUrlToFile(image, `apartment-image-${index + 1}.jpg`))
      .filter((image): image is File => image !== null);

    if (dataUrlImages.length) {
      return dataUrlImages;
    }

    const fallbackImage = data.imageFile || this.dataUrlToFile(data.imageUrl);
    return fallbackImage ? [fallbackImage] : [];
  }
}
