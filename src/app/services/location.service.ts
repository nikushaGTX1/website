import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, from, Observable, shareReplay, tap } from 'rxjs';
import { ApiLocation } from '../models/location';
import { API_URL } from '../utils/api-config';
import { AppLanguage } from './translation.service';
import { PersistentDataCache } from '../utils/persistent-data-cache';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly catalogUrl = `${API_URL}/locations/catalog`;
  private readonly streetsUrl = `${API_URL}/Streets`;
  private readonly persistentCache = new PersistentDataCache(
    'verified-location-catalog-v7',
    5 * 60 * 1000,
  );
  private locations$?: Observable<ApiLocation[]>;
  private readonly georgianStreetNames = new Map<string, string>();
  private readonly streetTranslations: Array<{ english: string; georgian: string }> = [];

  constructor(private http: HttpClient) {}

  getStreet(id: number): Observable<{
    id: number;
    nameKa: string;
    nameEn: string;
    districtId: number;
    district: string;
    geometry?: { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] } | null;
    bounds: { type: 'Polygon'; coordinates: number[][][] };
    geometryStatus: string;
  }> {
    return this.http.get<any>(`${this.streetsUrl}/${id}`);
  }

  getArea(id: number): Observable<{
    id: number;
    nameKa: string;
    nameEn: string;
    geometry?: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
    geometryStatus: string;
  }> {
    return this.http.get<any>(`${this.catalogUrl}/${id}`);
  }

  resolvePoint(latitude: number, longitude: number): Observable<{
    id: number; nameKa: string; nameEn: string; slug: string;
  }> {
    return this.http.post<any>(`${this.catalogUrl}/resolve-point`, { latitude, longitude });
  }

  getIntersectingStreets(coordinates: number[][][]): Observable<Array<{
    id: number; nameKa: string; nameEn: string; districtId: number; district: string;
  }>> {
    return this.http.post<any>(`${this.streetsUrl}/intersecting`, { coordinates });
  }

  getLocations(): Observable<ApiLocation[]> {
    if (!this.locations$) {
      this.locations$ = from(this.loadLocations()).pipe(
          tap((locations) => this.indexApiStreetTranslations(locations)),
          shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.locations$;
  }

  private async loadLocations(): Promise<ApiLocation[]> {
    const cached = await this.persistentCache.get<ApiLocation[]>('all');
    if (cached?.length) return cached;
    const [areas, streets, legacyLocations] = await Promise.all([
      firstValueFrom(this.http.get<Array<{
        id: number;
        parentId?: number;
        type: 'city' | 'district';
        nameKa: string;
        nameEn: string;
        slug: string;
        geometryStatus: string;
      }>>(this.catalogUrl)),
      firstValueFrom(this.http.get<Array<{
        id: number;
        nameKa: string;
        nameEn: string;
        aliases: string[];
        cityId: number;
        districtId: number;
        district: string;
        geometryStatus: string;
      }>>(this.streetsUrl)),
      firstValueFrom(this.http.get<Array<{
        city: string;
        district: string;
        districtGeorgian?: string | null;
      }>>(`${API_URL}/Locations`)),
    ]);
    const city = areas.find((area) => area.type === 'city');
    const legacyEnglishByGeorgian = new Map(
      legacyLocations
        .filter(
          (location) =>
            location.city === 'Tbilisi' &&
            !!location.district?.trim() &&
            !!location.districtGeorgian?.trim() &&
            location.districtGeorgian !== 'System.Collections.Hashtable',
        )
        .map((location) => [
          location.districtGeorgian!.trim().toLocaleLowerCase('ka'),
          location.district.trim(),
        ]),
    );
    const locations: ApiLocation[] = areas
      .filter((area) => area.type === 'district')
      .map((district) => {
        const catalogEnglish = district.nameEn.trim();
        const englishName = /[A-Za-z]/.test(catalogEnglish)
          ? catalogEnglish
          : legacyEnglishByGeorgian.get(district.nameKa.trim().toLocaleLowerCase('ka')) ||
            catalogEnglish;
        return {
        id: district.id,
        city: city?.nameEn || 'Tbilisi',
        cityKa: city?.nameKa || 'თბილისი',
        district: englishName,
        geometryStatus: district.geometryStatus,
        districtKa: district.nameKa,
        region: city?.nameEn || 'Tbilisi',
        streetNames: streets
          .filter((street) => street.districtId === district.id)
          .map((street) => street.nameEn),
        streets: streets
          .filter((street) => street.districtId === district.id)
          .map((street) => ({
            id: street.id,
            english: street.nameEn,
            georgian: street.nameKa,
            aliases: street.aliases || [],
            geometryStatus: street.geometryStatus,
          })),
        };
      });
    if (locations.length) await this.persistentCache.set('all', locations);
    return locations;
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

  /**
   * The street catalog comes straight from OpenStreetMap and, alongside real streets,
   * includes parks, squares and gardens with no field marking them as such. Used to keep
   * those out of street search results and autocomplete.
   */
  private static readonly nonStreetPattern =
    /\b(park|square|garden)\b|პარკი|სკვერი|ბაღი|მოედანი|парк|сквер|сад|площад/i;

  isLikelyStreet(street: { label: string; value: string }): boolean {
    return (
      !LocationService.nonStreetPattern.test(street.label) &&
      !LocationService.nonStreetPattern.test(street.value)
    );
  }

  streetNames(location: ApiLocation, language: AppLanguage): Array<{
    id: number;
    label: string;
    value: string;
    aliases: string[];
  }> {
    if (location.streets?.length) {
      return location.streets.map((street) => ({
        id: street.id,
        value: street.english,
        aliases: street.aliases || [],
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
      id: 0,
      value,
      aliases: [],
      label:
        localized?.[index] ||
        (language === 'ka'
          ? this.findGeorgianStreetName(value)
          : undefined) ||
        value,
    }));
  }

  private static readonly latin: Record<string, string> = {
    'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'ვ': 'v', 'ზ': 'z', 'თ': 't', 'ი': 'i', 'კ': 'k', 'ლ': 'l',
    'მ': 'm', 'ნ': 'n', 'ო': 'o', 'პ': 'p', 'ჟ': 'zh', 'რ': 'r', 'ს': 's', 'ტ': 't', 'უ': 'u', 'ფ': 'p', 'ქ': 'k',
    'ღ': 'gh', 'ყ': 'q', 'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts', 'ძ': 'dz', 'წ': 'ts', 'ჭ': 'ch', 'ხ': 'kh', 'ჯ': 'j', 'ჰ': 'h',
  };

  /** Official Georgian → Latin romanization, e.g. "ფერმწერთა" → "permtserta". */
  transliterate(value: string): string {
    return [...value].map((char) => LocationService.latin[char] ?? char).join('');
  }

  /** Lowercase, letters/digits only, with sounds people spell differently folded together (f/p, q/k, j/zh…). */
  private searchKey(value: string): string {
    return this.transliterate(value.toLocaleLowerCase())
      .replace(/[^a-z0-9Ѐ-ӿ]+/g, '')
      .replace(/ph|f/g, 'p').replace(/q/g, 'k').replace(/zh/g, 'j').replace(/gh/g, 'g').replace(/kh|x/g, 'k')
      .replace(/tz|c(?!h)/g, 'ts').replace(/w/g, 'v').replace(/y/g, 'i');
  }

  /** English label for streets that only have a Georgian name in the catalog. */
  private latinStreetLabel(value: string): string {
    return this.transliterate(value)
      .replace(/\s*ქ\.?$|\s*k\.$/i, ' St.')
      .replace(/(^|[\s(-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  }

  /**
   * Street autocomplete shared by the listing forms. A district can appear several times
   * (OSM and official catalog), so every entry with that name is searched first; then the
   * rest of Tbilisi, so a street filed under a neighbouring district is still found.
   * Matches English, Georgian, aliases and Latin transliteration in either direction.
   */
  searchStreets(
    locations: ApiLocation[],
    districtValue: string,
    rawQuery: string,
    language: AppLanguage,
    limit = 12,
  ): Array<{ id: number; label: string; value: string; district: string; districtValue: string; region: string; inDistrict: boolean }> {
    const query = this.searchKey(rawQuery.trim().replace(/\s*(street|st\.?|ქუჩა|ქ\.?|улица|ул\.?)$/i, ''));
    const tbilisi = locations.filter((entry) => entry.city === 'Tbilisi');
    const own = tbilisi.filter((entry) => entry.district === districtValue || entry.district === 'All Tbilisi');
    const ordered = [...own, ...(query.length >= 2 ? tbilisi.filter((entry) => !own.includes(entry)) : [])];
    const seen = new Set<string>();
    const results: Array<{ id: number; label: string; value: string; district: string; districtValue: string; region: string; inDistrict: boolean }> = [];

    for (const entry of ordered) {
      const inDistrict = own.includes(entry);
      const english = this.streetNames(entry, 'en');
      const georgian = this.streetNames(entry, 'ka');
      for (let index = 0; index < english.length && results.length < limit; index++) {
        const street = english[index];
        const ka = georgian[index]?.label || street.value;
        const names = [street.value, ka, ...street.aliases];
        const name = this.searchKey(ka) || this.searchKey(street.value);
        // Same name in another district is a different street; duplicate catalog entries of one district are not.
        const dedupe = `${name}|${entry.district}`;
        if (!name || seen.has(dedupe)) continue;
        if (query && !names.some((name) => this.searchKey(name).includes(query))) continue;
        if (!this.isLikelyStreet({ label: ka, value: street.value })) continue;
        seen.add(dedupe);
        const hasLatin = /[A-Za-z]/.test(street.value);
        results.push({
          id: street.id,
          label: language === 'ka' ? ka : hasLatin ? street.value : this.latinStreetLabel(ka),
          value: street.value,
          district: entry.district === 'All Tbilisi' ? '' : this.districtName(entry, language),
          districtValue: entry.district === 'All Tbilisi' ? districtValue : entry.district,
          region: entry.region,
          inDistrict,
        });
      }
      if (results.length >= limit) break;
    }
    // Streets in the chosen district come first, then the rest of the city.
    return results.sort((a, b) => Number(b.inDistrict) - Number(a.inDistrict));
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
