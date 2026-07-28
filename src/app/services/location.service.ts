import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { ApiLocation } from '../models/location';
import { API_URL } from '../utils/api-config';
import { AppLanguage } from './translation.service';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly locationsUrl = `${API_URL}/Locations`;
  private locations$?: Observable<ApiLocation[]>;

  constructor(private http: HttpClient) {}

  getLocations(): Observable<ApiLocation[]> {
    if (!this.locations$) {
      this.locations$ = this.http
        .get<ApiLocation[]>(this.locationsUrl)
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.locations$;
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
            ? street.georgian || this.georgianStreetFallback(street.english)
            : street.english,
      }));
    }

    const localized =
      language === 'ka'
        ? location.streetNamesKa || location.streetNamesGe || location.streetNamesGeo || location.streetNamesGeorgian || location.streetNameKa
        : undefined;

    return (location.streetNames || []).map((value, index) => ({
      value,
      label: localized?.[index] || value,
    }));
  }

  private georgianStreetFallback(english: string): string {
    const overrides: Record<string, string> = {
      'mcxeta st.': 'მცხეთის ქუჩა',
      'mckheta st.': 'მცხეთის ქუჩა',
    };
    return overrides[english.trim().toLowerCase()] || english;
  }
}
