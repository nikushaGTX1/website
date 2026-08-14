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
  @Output() drawnStreetsChange = new EventEmitter<Array<{ label: string; value: string }>>();
  @Output() detectedAreaChange = new EventEmitter<string>();

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
  private preserveDrawnPolygonOnInputChange = false;
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
    const preserveDrawnPolygon = this.preserveDrawnPolygonOnInputChange;
    this.preserveDrawnPolygonOnInputChange = false;
    if (changes['selectedAreasInput'] && this.draw && this.map && !preserveDrawnPolygon) {
      void this.chooseAreas(this.selectedAreasInput);
    } else if (changes['selectedAreaInput'] && this.selectedAreaInput && this.draw && this.map && !preserveDrawnPolygon) {
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
    this.draw?.setMode('polyline');
    this.polygonChange.emit(null);
    this.drawnStreetsChange.emit([]);
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
    this.draw?.setMode('polyline');
    this.polygonChange.emit(null);
    this.drawnStreetsChange.emit([]);
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
      const district = selection.district;
      // Resolve both language aliases concurrently. Empty provider responses
      // are normal and must not surface as an AggregateError in production.
      const aliases = [...new Set(parts.length ? parts : [selection.street])];
      const results = await Promise.all(aliases.map((street) =>
        this.loadStreetLines(street, district).catch(() => []),
      ));
      return results.find((lines) => lines.length) || [];
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
        // An overloaded provider may return no ways. Never make that temporary
        // failure permanent for the lifetime of the page.
        if (lines.length) DrawAreaMapComponent.sharedStreetCache.set(cacheKey, lines);
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
      lines = [];
    }
    const districtPolygons = this.boundaryCache.get(`area:${district.toLowerCase()}`) || [];
    if (districtPolygons.length) {
      lines = lines.filter((line) => line.some((point) =>
        districtPolygons.some((polygon) => this.pointInRing(point, polygon[0])),
      ));
    }
    return lines;
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
    let payload: {
      streets?: Array<{ names: string[]; line: number[][] }>;
      elements?: Array<{
        tags?: Record<string, string>;
        geometry?: Array<{ lon: number; lat: number }>;
      }>;
    } | undefined;
    try {
      const response = await fetch(`/map-data/district-streets?relationId=${relationId}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        payload = await response.json();
      }
    } catch {
      payload = undefined;
    }

    if (!payload?.streets?.length && !payload?.elements?.length) {
      const query = `[out:json][timeout:25];rel(${relationId});map_to_area->.district;way(area.district)[highway][name];out tags geom;`;
      payload = await this.fetchOverpass(query);
    }

    if (payload?.streets?.length) return payload.streets;
    return (payload?.elements || []).map((element) => ({
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
      const { TerraDraw, TerraDrawPolygonMode, TerraDrawPolyLineMode, TerraDrawSelectMode } = terraDraw;
      const { TerraDrawGoogleMapsAdapter } = googleAdapter;
      this.map = new Map(mapElement.nativeElement, {
        center: { lat: 41.7151, lng: 44.8271 },
        zoom: 12,
        minZoom: 9,
        maxZoom: 20,
        gestureHandling: 'greedy',
        scrollwheel: true,
        zoomControl: true,
        disableDoubleClickZoom: true,
        keyboardShortcuts: true,
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
              fillOpacity: 0,
              outlineColor: '#451a8f',
              outlineWidth: 3,
            },
          }),
          new TerraDrawPolyLineMode({
            validation: (feature, context) => {
              const distinctPoints = this.distinctPolygonPointCount(feature);
              return {
                valid: context.updateType !== 'finish'
                  || feature.geometry.type !== 'Polygon'
                  || distinctPoints >= 4,
                reason: 'Choose at least four points to draw an area.',
              };
            },
            styles: {
              lineStringColor: '#451a8f',
              lineStringWidth: 3,
              polygonFillColor: '#451a8f',
              polygonFillOpacity: 0.16,
              polygonOutlineColor: '#451a8f',
              polygonOutlineWidth: 3,
              closingPointColor: '#ffffff',
              closingPointWidth: 8,
              closingPointOutlineColor: '#451a8f',
              closingPointOutlineWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            styles: {
              selectedPolygonColor: '#451a8f',
              selectedPolygonFillOpacity: 0.16,
              selectedPolygonOutlineColor: '#451a8f',
              selectedPolygonOutlineWidth: 3,
            },
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: { midpoints: true, draggable: true, deletable: true },
                },
              },
              polyline: {
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
      this.draw.setMode('polyline');
      this.draw.on('finish', () => {
        const polygons = this.draw?.getSnapshot().filter((feature) => feature.geometry?.type === 'Polygon') || [];
        if (polygons.length > 1) this.draw?.removeFeatures(polygons.slice(0, -1).map((feature) => feature.id));
        const latest = this.draw?.getSnapshot().find((feature) => feature.geometry?.type === 'Polygon');
        if (latest && this.distinctPolygonPointCount(latest) < 4) {
          this.draw?.removeFeatures([latest.id]);
          this.draw?.setMode('polyline');
          this.hasPolygon = false;
          this.polygonChange.emit(null);
          this.cdr.detectChanges();
          return;
        }
        this.hasPolygon = !!latest;
        if (latest) this.draw?.selectFeature(latest.id);
        const polygon = this.currentPolygon();
        this.polygonChange.emit(polygon);
        if (polygon) void this.emitDrawnAreaStreets(polygon);
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

  private distinctPolygonPointCount(feature: { geometry?: { type?: string; coordinates?: unknown } }): number {
    if (feature.geometry?.type !== 'Polygon' || !Array.isArray(feature.geometry.coordinates)) return 0;
    const ring = feature.geometry.coordinates[0];
    if (!Array.isArray(ring)) return 0;
    return new Set(
      ring
        .filter((point): point is number[] => Array.isArray(point) && point.length >= 2)
        .map((point) => `${point[0]},${point[1]}`),
    ).size;
  }

  private async emitDrawnAreaStreets(polygon: GeoJsonPolygon): Promise<void> {
    const districtPromise = this.detectDistrictForPolygon(polygon);
    void districtPromise.then((district) => {
      this.preserveDrawnPolygonOnInputChange = !!district;
      this.detectedAreaChange.emit(district);
    });
    try {
      const ring = polygon.coordinates[0];
      let streets: Array<{ names: string[]; line: number[][] }>;
      try {
        streets = await this.fetchPolygonStreets(ring);
      } catch {
        const fallbackDistrict = await districtPromise;
        const relationId = fallbackDistrict ? this.areaRelationIds[fallbackDistrict] : undefined;
        streets = relationId ? await this.fetchDistrictStreets(relationId) : [];
      }
      const detectedArea = await districtPromise;
      if (detectedArea) {
        for (const street of streets) {
          for (const name of street.names) {
            const lines = [street.line];
            DrawAreaMapComponent.sharedStreetCache.set(`${detectedArea.toLowerCase()}:${name.toLowerCase()}`, lines);
            DrawAreaMapComponent.sharedStreetCache.set(
              `${detectedArea.toLowerCase()}:${this.normalizeStreetName(name)}`,
              lines,
            );
          }
        }
      }
      const useGeorgian = document.documentElement.lang === 'ka';
      const matches = streets
        .filter((street) => this.lineIntersectsRing(street.line, ring))
        .map((street) => {
          const english = street.names.find((name) => /[A-Za-z]/.test(name)) || street.names[0];
          const georgian = street.names.find((name) => /[\u10A0-\u10FF]/.test(name));
          return { label: useGeorgian && georgian ? georgian : english, value: english };
        })
        .filter((street, index, list) => list.findIndex((item) => item.value === street.value) === index)
        .sort((left, right) => left.label.localeCompare(right.label, useGeorgian ? 'ka' : 'en'));
      this.drawnStreetsChange.emit(matches);
      this.cdr.detectChanges();
    } catch {
      this.drawnStreetsChange.emit([]);
      this.cdr.detectChanges();
    }
  }

  private async fetchPolygonStreets(ring: number[][]): Promise<Array<{ names: string[]; line: number[][] }>> {
    const points = ring.filter((point, index) =>
      point.length >= 2 && (index !== ring.length - 1 || point[0] !== ring[0][0] || point[1] !== ring[0][1]));
    if (points.length < 3) return [];
    const googleStreets = await this.fetchGoogleStreetsInPolygon(points);
    if (googleStreets.length) return googleStreets;
    const overpassPolygon = points.map(([longitude, latitude]) => `${latitude} ${longitude}`).join(' ');
    const query = `[out:json][timeout:25];way(poly:"${overpassPolygon}")[highway][name];out tags geom;`;
    const payload = await this.fetchOverpass(query) as {
      elements?: Array<{
        tags?: Record<string, string>;
        geometry?: Array<{ lon: number; lat: number }>;
      }>;
    };
    return (payload.elements || []).map((element) => ({
      names: [...new Set([
        element.tags?.['name'],
        element.tags?.['name:en'],
        element.tags?.['name:ka'],
      ].filter((name): name is string => !!name))],
      line: (element.geometry || []).map((point) => [point.lon, point.lat]),
    })).filter((street) => street.names.length > 0 && street.line.length >= 2);
  }

  private async fetchGoogleStreetsInPolygon(ring: number[][]): Promise<Array<{ names: string[]; line: number[][] }>> {
    const longitudes = ring.map(([longitude]) => longitude);
    const latitudes = ring.map(([, latitude]) => latitude);
    const minimumLongitude = Math.min(...longitudes);
    const maximumLongitude = Math.max(...longitudes);
    const minimumLatitude = Math.min(...latitudes);
    const maximumLatitude = Math.max(...latitudes);
    const center = [
      ring.reduce((total, [longitude]) => total + longitude, 0) / ring.length,
      ring.reduce((total, [, latitude]) => total + latitude, 0) / ring.length,
    ];
    const ringStep = Math.max(1, Math.ceil(ring.length / 4));
    const samples: number[][] = [center, ...ring.filter((_, index) => index % ringStep === 0)];

    for (let row = 1; row <= 2; row++) {
      for (let column = 1; column <= 2; column++) {
        const point = [
          minimumLongitude + (maximumLongitude - minimumLongitude) * column / 3,
          minimumLatitude + (maximumLatitude - minimumLatitude) * row / 3,
        ];
        if (this.pointInRing(point, ring)) samples.push(point);
      }
    }

    const uniqueSamples = samples
      .filter((point, index, list) => list.findIndex((candidate) =>
        Math.abs(candidate[0] - point[0]) < 0.00001 && Math.abs(candidate[1] - point[1]) < 0.00001) === index)
      .slice(0, 9);
    const geocoder = new google.maps.Geocoder();
    const results = await Promise.allSettled(uniqueSamples.map(async ([longitude, latitude]) => ({
      point: [longitude, latitude],
      response: await geocoder.geocode({ location: { lat: latitude, lng: longitude } }),
    })));
    const streets = results.flatMap((result) => {
      if (result.status !== 'fulfilled') return [];
      return result.value.response.results.flatMap((address) => {
        const addressPoint = [address.geometry.location.lng(), address.geometry.location.lat()];
        if (!this.pointInRing(addressPoint, ring)) return [];
        return address.address_components
          .filter((component) => component.types.includes('route'))
          .flatMap((component) => [component.long_name, component.short_name])
          .filter((name) => !!name)
          .map((name) => {
            const samplePoint = result.value.point;
            const hasVisibleLength = Math.abs(samplePoint[0] - addressPoint[0]) > 0.00001
              || Math.abs(samplePoint[1] - addressPoint[1]) > 0.00001;
            const secondPoint = hasVisibleLength
              ? samplePoint
              : [addressPoint[0] + 0.00012, addressPoint[1]];
            return { names: [name], line: [addressPoint, secondPoint] };
          });
      });
    });
    return streets.filter((street, index, list) =>
      list.findIndex((candidate) => candidate.names[0].toLowerCase() === street.names[0].toLowerCase()) === index);
  }

  private async fetchOverpass<T>(query: string): Promise<T> {
    let lastStatus = 0;
    for (const endpoint of ['/overpass-api', '/overpass-api-backup', '/overpass-api-alt']) {
      try {
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(30000),
        });
        lastStatus = response.status;
        if (response.ok && response.headers.get('content-type')?.includes('json')) {
          return await response.json() as T;
        }
      } catch {
        // Try the next independent OpenStreetMap mirror.
      }
    }
    throw new Error(`OpenStreetMap street services are unavailable (${lastStatus || 'network error'}).`);
  }

  private lineIntersectsRing(line: number[][], ring: number[][]): boolean {
    if (line.some((point) => this.pointInRing(point, ring))) return true;
    for (let lineIndex = 1; lineIndex < line.length; lineIndex++) {
      for (let ringIndex = 0; ringIndex < ring.length; ringIndex++) {
        const nextRingIndex = (ringIndex + 1) % ring.length;
        if (this.segmentsIntersect(line[lineIndex - 1], line[lineIndex], ring[ringIndex], ring[nextRingIndex])) {
          return true;
        }
      }
    }
    return false;
  }

  private segmentsIntersect(firstStart: number[], firstEnd: number[], secondStart: number[], secondEnd: number[]): boolean {
    const orientation = (start: number[], end: number[], point: number[]) =>
      (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
    const firstSide = orientation(firstStart, firstEnd, secondStart);
    const secondSide = orientation(firstStart, firstEnd, secondEnd);
    const thirdSide = orientation(secondStart, secondEnd, firstStart);
    const fourthSide = orientation(secondStart, secondEnd, firstEnd);
    return ((firstSide <= 0 && secondSide >= 0) || (firstSide >= 0 && secondSide <= 0))
      && ((thirdSide <= 0 && fourthSide >= 0) || (thirdSide >= 0 && fourthSide <= 0));
  }

  private async detectDistrictForPolygon(polygon: GeoJsonPolygon): Promise<string> {
    const ring = polygon.coordinates[0].filter((point) => point.length >= 2);
    if (!ring.length) return '';

    const uniquePoints = ring.filter((point, index) =>
      index !== ring.length - 1 || point[0] !== ring[0][0] || point[1] !== ring[0][1]);
    const center = uniquePoints.reduce(
      ([longitude, latitude], [pointLongitude, pointLatitude]) =>
        [longitude + pointLongitude, latitude + pointLatitude],
      [0, 0],
    ).map((coordinate) => coordinate / uniquePoints.length);

    try {
      const result = await new google.maps.Geocoder().geocode({
        location: { lat: center[1], lng: center[0] },
      });
      const areaAliases: Array<{ area: string; aliases: string[] }> = [
        { area: 'Airport Settlement', aliases: ['airport settlement', 'აეროპორტის დასახლება'] },
        { area: 'Varketili', aliases: ['varketili', 'ვარკეთილი'] },
        { area: 'Vazisubani', aliases: ['vazisubani', 'ვაზისუბანი'] },
        { area: 'Samgori', aliases: ['samgori', 'სამგორი'] },
        { area: 'Lilo', aliases: ['lilo', 'ლილო'] },
        { area: 'Navtlughi', aliases: ['navtlughi', 'ნავთლუღი'] },
        { area: 'Ortachala', aliases: ['ortachala', 'ორთაჭალა'] },
        { area: 'Isani', aliases: ['isani', 'ისანი'] },
        { area: 'Mukhiani', aliases: ['mukhiani', 'მუხიანი'] },
        { area: 'Gldani', aliases: ['gldani', 'გლდანი'] },
        { area: 'Sanzona', aliases: ['sanzona', 'სანზონა'] },
        { area: 'Temqa', aliases: ['temqa', 'თემქა'] },
        { area: 'Nadzaladevi', aliases: ['nadzaladevi', 'ნაძალადევი'] },
        { area: 'Didi Digomi', aliases: ['didi digomi', 'great digomi', 'დიდი დიღომი'] },
        { area: 'Digomi', aliases: ['digomi', 'დიღომი'] },
        { area: 'Didube', aliases: ['didube', 'დიდუბე'] },
        { area: 'Vashlijvari', aliases: ['vashlijvari', 'ვაშლიჯვარი'] },
        { area: 'Delisi', aliases: ['delisi', 'დელისი'] },
        { area: 'Vedzisi', aliases: ['vedzisi', 'ვეძისი'] },
        { area: 'Nutsubidze', aliases: ['nutsubidze', 'ნუცუბიძე'] },
        { area: 'Saburtalo', aliases: ['saburtalo', 'საბურთალო'] },
        { area: 'Bagebi', aliases: ['bagebi', 'ბაგები'] },
        { area: 'Tskneti', aliases: ['tskneti', 'წყნეთი'] },
        { area: 'Vake', aliases: ['vake', 'ვაკე'] },
        { area: 'Vera', aliases: ['vera', 'ვერა'] },
        { area: 'Mtatsminda', aliases: ['mtatsminda', 'მთაწმინდა'] },
        { area: 'Sololaki', aliases: ['sololaki', 'სოლოლაკი'] },
        { area: 'Marjanishvili', aliases: ['marjanishvili', 'მარჯანიშვილი'] },
        { area: 'Chugureti', aliases: ['chugureti', 'ჩუღურეთი'] },
        { area: 'Avlabari', aliases: ['avlabari', 'ავლაბარი'] },
        { area: 'Ponichala', aliases: ['ponichala', 'ფონიჭალა'] },
        { area: 'Krtsanisi', aliases: ['krtsanisi', 'კრწანისი'] },
      ];
      for (const address of result.results) {
        const normalizedParts = address.address_components
          .flatMap((component) => [component.long_name, component.short_name])
          .map((part) => part.toLowerCase());
        const detected = areaAliases.find(({ aliases }) => aliases.some((alias) =>
          normalizedParts.some((part) => part.includes(alias))))?.area;
        if (detected) return detected;
      }
    } catch {
      // Street lookup uses the polygon directly, so district naming is optional.
    }
    const districtCenters: Record<string, number[]> = {
      Vake: [44.75, 41.71], Saburtalo: [44.74, 41.725], Vera: [44.785, 41.71],
      Mtatsminda: [44.79, 41.695], Didube: [44.778, 41.749], Digomi: [44.735, 41.78],
      'Didi Digomi': [44.70, 41.79], Gldani: [44.815, 41.79], Nadzaladevi: [44.79, 41.77],
      Isani: [44.82, 41.69], Samgori: [44.87, 41.70], Avlabari: [44.815, 41.693],
      Sololaki: [44.80, 41.69], Chugureti: [44.80, 41.72], Krtsanisi: [44.82, 41.67],
      Vashlijvari: [44.72, 41.76],
    };
    return Object.entries(districtCenters).sort(([, left], [, right]) => {
      const leftDistance = (left[0] - center[0]) ** 2 + (left[1] - center[1]) ** 2;
      const rightDistance = (right[0] - center[0]) ** 2 + (right[1] - center[1]) ** 2;
      return leftDistance - rightDistance;
    })[0]?.[0] || '';
  }
}
