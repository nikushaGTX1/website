import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import { ApiLocation } from '../models/location';
import { API_URL } from '../utils/api-config';
import { AppLanguage } from './translation.service';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly locationsUrl = `${API_URL}/Locations`;
  private locations$?: Observable<ApiLocation[]>;
  private readonly georgianStreetNames = new Map<string, string>();
  private readonly streetTranslations: Array<{ english: string; georgian: string }> = [];

  constructor(private http: HttpClient) {}

  getLocations(): Observable<ApiLocation[]> {
    if (!this.locations$) {
      this.locations$ = this.http
        .get<ApiLocation[]>(this.locationsUrl)
        .pipe(
          tap((locations) => this.indexApiStreetTranslations(locations)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.locations$;
  }

  languageForQuery(...values: Array<string | undefined>): AppLanguage {
    for (const value of values) {
      const query = value?.trim() || '';
      if (/[\u10A0-\u10FF]/.test(query)) return 'ka';
      if (/[A-Za-z]/.test(query)) return 'en';
    }
    return 'ka';
  }

  cityName(location: ApiLocation, language: AppLanguage): string {
    return language === 'ka'
      ? location.cityKa || location.cityGe || location.cityGeo || location.cityGeorgian || location.cityNameKa || location.city
      : location.city;
  }

  districtName(location: ApiLocation, language: AppLanguage): string {
    const georgian =
      location.districtKa ||
      location.districtGe ||
      location.districtGeo ||
      location.districtGeorgian ||
      location.districtNameKa;
    return language === 'ka' && georgian && georgian !== 'System.Collections.Hashtable'
      ? georgian
      : location.district;
  }

  regionName(location: ApiLocation, language: AppLanguage): string {
    return language === 'ka'
      ? location.regionKa || location.regionGe || location.regionGeo || location.regionGeorgian || location.regionNameKa || location.region
      : location.region;
  }

  streetNames(location: ApiLocation, language: AppLanguage): Array<{ label: string; value: string }> {
    if (location.streets?.length) {
      return location.streets.map((street) => ({
        value: street.english,
        label:
          language === 'ka'
            ? street.georgian ||
              this.findGeorgianStreetName(street.english) ||
              street.english
            : street.english,
      }));
    }

    const localized =
      language === 'ka'
        ? location.streetNamesKa || location.streetNamesGe || location.streetNamesGeo || location.streetNamesGeorgian || location.streetNameKa
        : undefined;

    return (location.streetNames || []).map((value, index) => ({
      value,
      label:
        localized?.[index] ||
        (language === 'ka'
          ? this.findGeorgianStreetName(value)
          : undefined) ||
        value,
    }));
  }

  private indexApiStreetTranslations(locations: ApiLocation[]): void {
    this.georgianStreetNames.clear();
    this.streetTranslations.length = 0;

    for (const location of locations) {
      if (location.streets?.length) {
        for (const street of location.streets) {
          if (street.georgian?.trim()) {
            this.addStreetTranslation(street.english, street.georgian);
          }
        }
        continue;
      }

      const localized =
        location.streetNamesKa ||
        location.streetNamesGe ||
        location.streetNamesGeo ||
        location.streetNamesGeorgian ||
        location.streetNameKa;

      (location.streetNames || []).forEach((english, index) => {
        const georgian = localized?.[index]?.trim();
        if (georgian) {
          this.addStreetTranslation(english, georgian);
        }
      });
    }
  }

  /**
   * Treat common OSM Latin transliterations as the same lookup key.
   * The translated value itself always comes from the Locations API.
   */
  private streetKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\b(street|str|st)\b\.?/g, '')
      .replace(/mckh|mcx|mtskh/g, 'mtskh')
      .replace(/[^a-z0-9\u10a0-\u10ff]/g, '');
  }

  private addStreetTranslation(english: string, georgian: string): void {
    const translated = georgian.trim();
    this.georgianStreetNames.set(this.streetKey(english), translated);
    this.streetTranslations.push({ english, georgian: translated });
  }

  private findGeorgianStreetName(english: string): string | undefined {
    const exact = this.georgianStreetNames.get(this.streetKey(english));
    if (exact) return exact;

    const sourceType = this.streetType(english);
    const sourceTokens = this.significantStreetTokens(english);
    if (!sourceTokens.length) return undefined;

    const matches = this.streetTranslations
      .filter(({ english: candidate }) =>
        (!sourceType || this.streetType(candidate) === sourceType) &&
        sourceTokens.every((token) =>
          this.significantStreetTokens(candidate).includes(token),
        ),
      )
      .map(({ georgian }) => georgian)
      .filter((value, index, values) => values.indexOf(value) === index);

    return matches.length === 1 ? matches[0] : undefined;
  }

  private significantStreetTokens(value: string): string[] {
    const ignored = new Set([
      'street', 'st', 'avenue', 'ave', 'road', 'rd', 'lane', 'ln',
      'square', 'highway', 'hwy', 'alley', 'the',
    ]);
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token && !ignored.has(token));
  }

  private streetType(value: string): string | undefined {
    const tokens = value.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (tokens.some((token) => token === 'avenue' || token === 'ave')) return 'avenue';
    if (tokens.some((token) => token === 'street' || token === 'st')) return 'street';
    if (tokens.some((token) => token === 'lane' || token === 'ln')) return 'lane';
    if (tokens.some((token) => token === 'road' || token === 'rd')) return 'road';
    if (tokens.includes('square')) return 'square';
    return undefined;
  }
}
