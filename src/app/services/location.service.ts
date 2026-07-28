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

  languageForQuery(...values: Array<string | undefined>): Exclude<AppLanguage, 'ru'> {
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
              this.georgianStreetNames.get(this.streetKey(street.english)) ||
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
          ? this.georgianStreetNames.get(this.streetKey(value))
          : undefined) ||
        value,
    }));
  }

  private indexApiStreetTranslations(locations: ApiLocation[]): void {
    this.georgianStreetNames.clear();

    for (const location of locations) {
      if (location.streets?.length) {
        for (const street of location.streets) {
          if (street.georgian?.trim()) {
            this.georgianStreetNames.set(
              this.streetKey(street.english),
              street.georgian.trim(),
            );
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
          this.georgianStreetNames.set(this.streetKey(english), georgian);
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
}
