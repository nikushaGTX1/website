import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { GeoJsonPolygon } from '../../services/apartment.service';
import { ApiLocation } from '../../models/location';
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-draw-area-map',
  standalone: false,
  templateUrl: './draw-area-map.component.html',
  styleUrl: './draw-area-map.component.css',
})
export class DrawAreaMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private static readonly sharedBoundaryCache = new Map<string, number[][][][]>();
  private static readonly boundaryRequests = new Map<string, Promise<number[][][][]>>();
  private static readonly sharedStreetCache = new Map<string, number[][][]>();
  private static readonly streetRequests = new Map<string, Promise<number[][][]>>();
  private static readonly districtStreetRequests = new Map<string, Promise<void>>();
  private static readonly loadedStreetDistricts = new Set<string>();
  @Input() visible = false;
  @Input() compact = false;
  @Input() selectedAreaInput = '';
  @Input() selectedAreasInput: string[] = [];
  @Input() selectedStreetsInput: Array<{ street: string; district: string }> = [];
  @HostBinding('class.is-hidden') get isHidden(): boolean { return !this.visible; }
  @HostBinding('class.is-compact') get isCompact(): boolean { return this.compact; }
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('compactMapContainer') compactMapContainer?: ElementRef<HTMLDivElement>;
  @Output() close = new EventEmitter<void>();
  @Output() apply = new EventEmitter<GeoJsonPolygon>();
  @Output() polygonChange = new EventEmitter<GeoJsonPolygon | null>();

  loading = true;
  errorMessage = '';
  hasPolygon = false;
  compactMapInteractive = false;
  areaSearch = '';
  streetSearch = '';
  selectedArea = '';
  selectedStreet = '';
  streetStep = false;
  locations: ApiLocation[] = [];
  searchMode: 'rent' | 'buy' = 'rent';
  propertyType = '';
  budget: number | null = null;
  bedrooms = '';
  validationMessage = '';
  readonly propertyTypes = ['Apartament', 'House', 'Commercial Place', 'Country house'];
  readonly bedroomChoices = [
    { value: '0', label: 'Studio' },
    { value: '1', label: '1 bedroom' },
    { value: '2', label: '2 bedrooms' },
    { value: '3', label: '3 bedrooms' },
    { value: '4+', label: '4+ bedrooms' },
  ];
  readonly popularAreas = ['Vake', 'Saburtalo', 'Vera', 'Mtatsminda', 'Digomi', 'Didi Digomi'];
  readonly areaGroups = [
    { title: 'VAKE DISTRICT', areas: ['Vake', 'Bagebi', 'Nutsubidze Plateau', 'Chavchavadze'] },
    { title: 'SABURTALO DISTRICT', areas: ['Saburtalo', 'Didube', 'Gldani', 'Nadzaladevi'] },
    { title: 'MTATSMINDA DISTRICT', areas: ['Vera', 'Mtatsminda', 'Sololaki', 'Avlabari'] },
    { title: 'OTHER AREAS', areas: ['Digomi', 'Didi Digomi', 'Vashlijvari', 'Krtsanisi'] },
  ];
  private map?: google.maps.Map;
  private draw?: import('terra-draw').TerraDraw;
  private streetLines: google.maps.Polyline[] = [];
  private selectionRevision = 0;
  private streetRevision = 0;
  private readonly boundaryCache = DrawAreaMapComponent.sharedBoundaryCache;
  // Stable OSM relation IDs remove the ambiguity and rate limits of free-text
  // geocoding. Each picker button now resolves to exactly one mapped area.
  private readonly areaRelationIds: Record<string, number> = {
    Vake: 14900501,
    Saburtalo: 5469869,
    Vera: 13949830,
    Mtatsminda: 2073140,
    Didube: 16749659,
    Digomi: 16356610,
    'Didi Digomi': 18183807,
    Gldani: 13438812,
    Nadzaladevi: 10790351,
    Isani: 18467266,
    Samgori: 11300436,
    Avlabari: 18467265,
    Sololaki: 2073133,
    Chugureti: 18466649,
    Krtsanisi: 18467369,
    Vashlijvari: 20111730,
  };

  constructor(private cdr: ChangeDetectorRef, private locationService: LocationService) {}

  ngAfterViewInit(): void {
    void this.initializeMap();
    this.locationService.getLocations().subscribe({
      next: (locations) => {
        this.locations = locations.filter((location) => location.city === 'Tbilisi');
        this.cdr.detectChanges();
      },
      error: () => undefined,
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedAreasInput'] && this.draw && this.map) {
      void this.chooseAreas(this.selectedAreasInput);
    } else if (changes['selectedAreaInput'] && this.selectedAreaInput && this.draw && this.map) {
      void this.chooseArea(this.selectedAreaInput);
    }
    if (changes['selectedStreetsInput'] && this.map) void this.drawSelectedStreets();
  }

  ngOnDestroy(): void {
    this.draw?.stop();
  }

  clearArea(): void {
    this.draw?.clear();
    this.hasPolygon = false;
    this.selectedArea = '';
    this.selectedStreet = '';
    this.streetStep = false;
    this.draw?.setMode('polygon');
    this.polygonChange.emit(null);
    this.clearStreetLines();
    this.map?.setOptions({ styles: null });
  }

  enableCompactMap(): void {
    this.compactMapInteractive = true;
    this.startDrawing();
  }

  applyCompactMapChanges(): void {
    const polygon = this.currentPolygon();
    if (!polygon) return;
    this.polygonChange.emit(polygon);
    this.compactMapInteractive = false;
  }

  get filteredAreaGroups(): { title: string; areas: string[] }[] {
    const query = this.areaSearch.trim().toLowerCase();
    if (!query) return this.areaGroups;
    return this.areaGroups
      .map((group) => ({ ...group, areas: group.areas.filter((area) => area.toLowerCase().includes(query)) }))
      .filter((group) => group.areas.length);
  }

  get selectedAreaStreets(): Array<{ label: string; value: string }> {
    const entry = this.locations.find((location) =>
      location.district.toLowerCase() === this.selectedArea.toLowerCase(),
    );
    const streets = entry ? this.locationService.streetNames(entry, 'en') : [];
    const query = this.streetSearch.trim().toLowerCase();
    return streets.filter((street) =>
      !query || street.label.toLowerCase().includes(query) || street.value.toLowerCase().includes(query),
    );
  }

  get popularStreets(): Array<{ label: string; value: string }> {
    return this.selectedAreaStreets.slice(0, 6);
  }

  selectStreet(street: { label: string; value: string }): void {
    this.selectedStreet = street.value;
    this.streetSearch = '';
  }

  backToAreas(): void {
    this.streetStep = false;
    this.selectedStreet = '';
    this.streetSearch = '';
  }

  chooseArea(area: string): void {
    void this.chooseAreas([area]);
  }

  async chooseAreas(areas: string[]): Promise<void> {
    if (!this.draw || !this.map) return;
    const revision = ++this.selectionRevision;
    // Remove the old district immediately. Otherwise it remains visible while
    // the newly selected OSM boundary is being downloaded.
    this.draw.clear();
    this.clearStreetLines();
    this.hasPolygon = false;
    this.selectedArea = '';
    this.selectedStreet = '';
    this.map.setOptions({
      styles: [{ featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
    });
    const drawableAreas = (await Promise.all(areas.map(async (area) => ({
      area,
      polygons: await this.loadBoundary(area),
    })))).filter((item) => item.polygons.length);
    if (revision !== this.selectionRevision) return;
    if (!drawableAreas.length) {
      this.selectedArea = '';
      this.hasPolygon = false;
      this.polygonChange.emit(null);
      this.cdr.detectChanges();
      return;
    }
    // Keep every neighbourhood as its own feature. Joining them with a convex
    // hull also selected the unrequested neighbourhoods between them.
    const features = drawableAreas.flatMap(({ area, polygons }) => polygons.map((coordinates) => ({
      type: 'Feature' as const,
      id: this.draw!.getFeatureId(),
      properties: { mode: 'polygon', name: area },
      geometry: { type: 'Polygon' as const, coordinates },
    })));
    const results = this.draw.addFeatures(features);
    const validFeatures = features.filter((_, index) => results[index]?.valid);
    if (validFeatures.length) {
      this.selectedArea = drawableAreas.map((item) => item.area).join(', ');
      this.selectedStreet = '';
      this.streetSearch = '';
      this.streetStep = true;
      this.hasPolygon = true;
      const bounds = new google.maps.LatLngBounds();
      drawableAreas.forEach(({ polygons }) => polygons.forEach((rings) =>
        rings.forEach((ring) => ring.forEach(([lng, lat]) => bounds.extend({ lat, lng }))),
      ),
      );
      this.map.fitBounds(bounds, 48);
      await this.drawSelectedStreets(false);
      this.cdr.detectChanges();
      this.polygonChange.emit(this.currentPolygon());
    } else {
      console.error('Could not draw selected areas.');
    }
  }

  startDrawing(): void {
    this.selectionRevision++;
    this.draw?.clear();
    this.clearStreetLines();
    this.selectedArea = '';
    this.hasPolygon = false;
    this.draw?.setMode('polygon');
    this.polygonChange.emit(null);
    this.map?.setOptions({ styles: null });
  }

  private async loadBoundary(area: string): Promise<number[][][][]> {
    const cacheKey = `area:${area.toLowerCase()}`;
    const cached = this.boundaryCache.get(cacheKey);
    if (cached) return cached;
    const pending = DrawAreaMapComponent.boundaryRequests.get(cacheKey);
    if (pending) return pending;
    const request = this.fetchBoundary(area, cacheKey)
      .finally(() => DrawAreaMapComponent.boundaryRequests.delete(cacheKey));
    DrawAreaMapComponent.boundaryRequests.set(cacheKey, request);
    return request;
  }

  private async fetchBoundary(area: string, cacheKey: string): Promise<number[][][][]> {
    try {
      const relationId = this.areaRelationIds[area];
      let geometry: { type: string; coordinates: unknown } | undefined;
      if (relationId) {
        let response: Response | undefined;
        try {
          response = await fetch(`/map-data/boundary?relationId=${relationId}`);
        } catch {
          response = undefined;
        }
        // Angular's standalone dev server may run without the Node map-data
        // proxy. The direct request is still the same exact OSM relation.
        if (!response?.ok || !response.headers.get('content-type')?.includes('application/json')) {
          response = await fetch(
            `https://polygons.openstreetmap.fr/get_geojson.py?id=${relationId}&params=0`,
          );
        }
        if (!response.ok) throw new Error(`Boundary service returned ${response.status}`);
        geometry = await response.json();
      } else {
        const results = await this.searchOpenStreetMap(`${area}, Tbilisi, Georgia`, true);
        geometry = results.find((result) =>
          result.geojson?.type === 'Polygon' || result.geojson?.type === 'MultiPolygon',
        )?.geojson;
      }
      const polygons = this.geoJsonPolygons(geometry);
      this.boundaryCache.set(cacheKey, polygons);
      return polygons;
    } catch (error) {
      console.error(`Could not load the exact boundary for ${area}:`, error);
      return [];
    }
  }

  private async drawSelectedStreets(fitToStreets = true): Promise<void> {
    if (!this.map) return;
    const revision = ++this.streetRevision;
    this.clearStreetLines();
    if (!this.selectedStreetsInput.length) return;
    const bounds = new google.maps.LatLngBounds();
    const paths = (await Promise.all(this.selectedStreetsInput.map(async (selection) => {
      const parts = selection.street.split(/\s+[—–-]\s+/).map((part) => part.trim()).filter(Boolean);
      const street = parts.at(-1) || selection.street;
      const district = selection.district;
      try {
        return await this.loadStreetLines(street, district);
      } catch (error) {
        console.error(`Could not draw ${street}:`, error);
        return [];
      }
    }))).flat();
    if (revision !== this.streetRevision) return;
    for (const path of paths) {
      const googlePath = path.map(([lng, lat]) => ({ lat, lng }));
      googlePath.forEach((point) => bounds.extend(point));
      // Render the selected road as a layered route. The subtle shadow lifts
      // it from the basemap, the white casing preserves contrast, and the
      // slimmer brand line keeps it crisp instead of looking marker-drawn.
      this.streetLines.push(
        new google.maps.Polyline({
          map: this.map,
          path: googlePath,
          strokeColor: '#2e1065',
          strokeOpacity: 0.22,
          strokeWeight: 13,
          zIndex: 998,
        }),
        new google.maps.Polyline({
          map: this.map,
          path: googlePath,
          strokeColor: '#ffffff',
          strokeOpacity: 0.96,
          strokeWeight: 9,
          zIndex: 999,
        }),
        new google.maps.Polyline({
          map: this.map,
          path: googlePath,
          strokeColor: '#6d28d9',
          strokeOpacity: 1,
          strokeWeight: 6,
          zIndex: 1000,
        }),
      );
    }
    if (fitToStreets && !bounds.isEmpty()) this.map.fitBounds(bounds, 70);
  }

  private async loadStreetLines(street: string, district: string): Promise<number[][][]> {
    const cacheKey = `${district.toLowerCase()}:${street.toLowerCase()}`;
    const cached = DrawAreaMapComponent.sharedStreetCache.get(cacheKey);
    if (cached) return cached;
    const pending = DrawAreaMapComponent.streetRequests.get(cacheKey);
    if (pending) return pending;
    const request = this.fetchStreetLines(street, district)
      .then((lines) => {
        DrawAreaMapComponent.sharedStreetCache.set(cacheKey, lines);
        return lines;
      })
      .finally(() => DrawAreaMapComponent.streetRequests.delete(cacheKey));
    DrawAreaMapComponent.streetRequests.set(cacheKey, request);
    return request;
  }

  private async fetchStreetLines(street: string, district: string): Promise<number[][][]> {
    // API street labels commonly contain initials and "st./street/avenue" while
    // OSM stores the full name. The longest meaningful word (usually the
    // surname) gives a safe, district-scoped match.
    const indexed = DrawAreaMapComponent.sharedStreetCache.get(
      `${district.toLowerCase()}:${this.normalizeStreetName(street)}`,
    );
    if (indexed?.length) return indexed;

    let lines: number[][][];
    try {
      const bbox = this.districtBoundingBox(district);
      const bboxQuery = bbox ? `&bbox=${bbox.join(',')}` : '';
      const response = await fetch(`/map-data/street?street=${encodeURIComponent(street)}${bboxQuery}`);
      if (!response.ok) throw new Error(`Street geometry service returned ${response.status}`);
      lines = ((await response.json() as { lines?: number[][][] }).lines || []);
    } catch {
      lines = await this.loadStreetLinesFromOverpass(street, district);
    }
    const districtPolygons = this.boundaryCache.get(`area:${district.toLowerCase()}`) || [];
    if (districtPolygons.length) {
      lines = lines.filter((line) => line.some((point) =>
        districtPolygons.some((polygon) => this.pointInRing(point, polygon[0])),
      ));
    }
    if (lines.length) return lines;

    // Retain a geocoding fallback for streets whose OSM way has no translated
    // name tag.
    const results = await this.searchOpenStreetMap(`${street}, ${district}, Tbilisi, Georgia`, false);
    const candidate = results.find((result) =>
      result.geojson?.type === 'LineString' || result.geojson?.type === 'MultiLineString',
    );
    return this.geoJsonLines(candidate?.geojson);
  }

  private preloadDistrictStreets(district: string): Promise<void> {
    const districtKey = district.toLowerCase();
    if (DrawAreaMapComponent.loadedStreetDistricts.has(districtKey)) return Promise.resolve();
    const pending = DrawAreaMapComponent.districtStreetRequests.get(districtKey);
    if (pending) return pending;
    const relationId = this.areaRelationIds[district];
    if (!relationId) return Promise.resolve();
    const request = this.fetchDistrictStreets(relationId)
      .then((streets) => {
        const grouped = new Map<string, number[][][]>();
        for (const street of streets) {
          for (const name of street.names) {
            const key = `${districtKey}:${this.normalizeStreetName(name)}`;
            grouped.set(key, [...(grouped.get(key) || []), street.line]);
          }
        }
        grouped.forEach((lines, key) => DrawAreaMapComponent.sharedStreetCache.set(key, lines));
        DrawAreaMapComponent.loadedStreetDistricts.add(districtKey);
      })
      .finally(() => DrawAreaMapComponent.districtStreetRequests.delete(districtKey));
    DrawAreaMapComponent.districtStreetRequests.set(districtKey, request);
    return request;
  }

  private async fetchDistrictStreets(relationId: number): Promise<Array<{ names: string[]; line: number[][] }>> {
    const response = await fetch(`/map-data/district-streets?relationId=${relationId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`District street service returned ${response.status}`);
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('District street service is unavailable.');
    }
    const payload = await response.json() as {
      streets?: Array<{ names: string[]; line: number[][] }>;
      elements?: Array<{
        tags?: Record<string, string>;
        geometry?: Array<{ lon: number; lat: number }>;
      }>;
    };
    if (payload.streets) return payload.streets;
    return (payload.elements || []).map((element) => ({
      names: [...new Set([
        element.tags?.['name'],
        element.tags?.['name:en'],
        element.tags?.['name:ka'],
      ].filter((name): name is string => !!name))],
      line: (element.geometry || []).map((point) => [point.lon, point.lat]),
    })).filter((street) => street.names.length > 0 && street.line.length >= 2);
  }

  private normalizeStreetName(name: string): string {
    return name.toLowerCase()
      .replace(/[.,]/g, ' ')
      .replace(/\b(street|st|avenue|ave|road|rd|lane)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async loadStreetLinesFromOverpass(street: string, district: string): Promise<number[][][]> {
    const tokens = street.replace(/[.,]/g, ' ').split(/\s+/)
      .filter((token) => token.length >= 4 && !/^(street|avenue|road|lane)$/i.test(token))
      .sort((left, right) => right.length - left.length);
    const searchToken = (tokens[0] || street).replace(/[\\"\n\r]/g, (character) => `\\${character}`);
    const bbox = this.districtBoundingBox(district) || [41.50, 44.55, 41.92, 45.10];
    const query = `[out:json][timeout:10];way["highway"][~"^(name|name:en|name:ka)$"~"${searchToken}",i](${bbox.join(',')});out geom;`;
    const response = await fetch(
      `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
    const payload = await response.json() as {
      elements?: Array<{ geometry?: Array<{ lon: number; lat: number }> }>;
    };
    return (payload.elements || [])
      .map((element) => (element.geometry || []).map((point) => [point.lon, point.lat]))
      .filter((line) => line.length >= 2);
  }

  private districtBoundingBox(district: string): [number, number, number, number] | null {
    const polygons = this.boundaryCache.get(`area:${district.toLowerCase()}`) || [];
    const points = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring));
    if (!points.length) return null;
    const longitudes = points.map(([longitude]) => longitude);
    const latitudes = points.map(([, latitude]) => latitude);
    return [
      Math.min(...latitudes),
      Math.min(...longitudes),
      Math.max(...latitudes),
      Math.max(...longitudes),
    ];
  }

  private pointInRing([x, y]: number[], ring: number[][]): boolean {
    let inside = false;
    for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
      const [currentX, currentY] = ring[current];
      const [previousX, previousY] = ring[previous];
      const crosses = (currentY > y) !== (previousY > y) &&
        x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  private clearStreetLines(): void {
    this.streetLines.forEach((line) => line.setMap(null));
    this.streetLines = [];
  }

  private async searchOpenStreetMap(query: string, polygon: boolean): Promise<Array<{ geojson?: { type: string; coordinates: unknown } }>> {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '8',
      countrycodes: 'ge',
      viewbox: '44.55,41.92,45.10,41.50',
      bounded: '1',
      polygon_geojson: polygon ? '1' : '0',
    });
    if (!polygon) params.set('polygon_geojson', '1');
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { 'Accept-Language': 'en,ka;q=0.9' } });
    if (!response.ok) throw new Error(`OpenStreetMap returned ${response.status}`);
    return response.json();
  }

  private geoJsonPolygons(geometry?: { type: string; coordinates: unknown }): number[][][][] {
    if (!geometry) return [];
    if (geometry.type === 'Polygon') return [geometry.coordinates as number[][][]];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates as number[][][][];
    return [];
  }

  private geoJsonLines(geometry?: { type: string; coordinates: unknown }): number[][][] {
    if (!geometry) return [];
    if (geometry.type === 'LineString') return [geometry.coordinates as number[][]];
    if (geometry.type === 'MultiLineString') return geometry.coordinates as number[][][];
    return [];
  }

  applyArea(): void {
    const polygon = this.currentPolygon();
    const missing: string[] = [];
    if (!polygon) missing.push('location');
    if (!this.propertyType) missing.push('property type');
    if (this.budget == null || this.budget <= 0) missing.push('budget');
    if (!this.bedrooms) missing.push('bedrooms');
    if (missing.length) {
      this.validationMessage = `Please choose ${missing.join(', ')} before searching.`;
      return;
    }
    this.validationMessage = '';
    this.apply.emit({
      ...polygon!,
      searchMode: this.searchMode,
      propertyType: this.propertyType,
      budget: this.budget!,
      bedrooms: this.bedrooms,
      streetName: this.selectedStreet || undefined,
    });
  }

  handleBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }

  private async initializeMap(): Promise<void> {
    const apiKey = document
      .querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')
      ?.content.trim();

    const mapElement = this.compact ? this.compactMapContainer : this.mapContainer;
    if (!apiKey || !mapElement) {
      this.errorMessage = 'Google Maps is not configured.';
      this.loading = false;
      return;
    }

    try {
      setOptions({ key: apiKey, v: 'weekly' });
      const [{ Map }, terraDraw, googleAdapter] = await Promise.all([
        importLibrary('maps') as Promise<google.maps.MapsLibrary>,
        import('terra-draw'),
        import('terra-draw-google-maps-adapter'),
      ]);
      const { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } = terraDraw;
      const { TerraDrawGoogleMapsAdapter } = googleAdapter;
      this.map = new Map(mapElement.nativeElement, {
        center: { lat: 41.7151, lng: 44.8271 },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });

      // The Google adapter binds to controls created inside `.gm-style`.
      // Those elements do not exist immediately after `new Map()`, so wait
      // for the first rendered frame before registering Terra Draw.
      await new Promise<void>((resolve) => {
        google.maps.event.addListenerOnce(this.map!, 'idle', () => resolve());
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      this.draw = new TerraDraw({
        adapter: new TerraDrawGoogleMapsAdapter({ lib: google.maps, map: this.map }),
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: '#451a8f',
              fillOpacity: 0.18,
              outlineColor: '#451a8f',
              outlineWidth: 3,
              closingPointColor: '#ffffff',
              closingPointWidth: 7,
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: { midpoints: true, draggable: true, deletable: true },
                },
              },
            },
          }),
        ],
      });
      this.draw.start();
      this.draw.setMode('polygon');
      this.draw.on('finish', () => {
        const polygons = this.draw?.getSnapshot().filter((feature) => feature.geometry?.type === 'Polygon') || [];
        if (polygons.length > 1) this.draw?.removeFeatures(polygons.slice(0, -1).map((feature) => feature.id));
        const latest = this.draw?.getSnapshot().find((feature) => feature.geometry?.type === 'Polygon');
        this.hasPolygon = !!latest;
        if (latest) this.draw?.selectFeature(latest.id);
        this.polygonChange.emit(this.currentPolygon());
        this.cdr.detectChanges();
      });
      this.draw.on('change', () => {
        this.hasPolygon = !!this.currentPolygon();
        if (!this.hasPolygon) this.selectedArea = '';
        this.polygonChange.emit(this.currentPolygon());
        this.cdr.detectChanges();
      });
      this.loading = false;
      this.errorMessage = '';
      this.cdr.detectChanges();
      if (this.selectedAreasInput.length) {
        try {
          await this.chooseAreas(this.selectedAreasInput);
        } catch (error) {
          console.error('Could not draw the selected areas:', error);
        }
      } else if (this.selectedAreaInput) {
        try {
          await this.chooseAreas([this.selectedAreaInput]);
        } catch (error) {
          console.error('Could not draw the selected area:', error);
        }
      }
      await this.drawSelectedStreets();
      if (!this.selectedAreasInput.length && !this.selectedAreaInput) {
        // Warm the two most-used boundaries after the map is interactive. A
        // later click reuses the same in-flight promise or completed geometry.
        setTimeout(() => {
          void Promise.all(['Vake', 'Saburtalo'].map((area) => this.loadBoundary(area)));
        }, 100);
      }
    } catch (error) {
      console.error('Draw Area map error:', error);
      this.errorMessage = this.map
        ? 'Area drawing is temporarily unavailable.'
        : 'Google Maps could not be loaded. Please try again.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private currentPolygon(): GeoJsonPolygon | null {
    const feature = this.draw?.getSnapshot().find((item) => item.geometry?.type === 'Polygon');
    return feature?.geometry?.type === 'Polygon'
      ? {
          type: 'Polygon',
          coordinates: feature.geometry.coordinates as number[][][],
          areaName: this.selectedArea || undefined,
          streetName: this.selectedStreet || undefined,
        }
      : null;
  }
}
