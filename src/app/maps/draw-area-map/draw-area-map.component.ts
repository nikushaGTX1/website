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
  private readonly areaPolygons: Record<string, number[][]> = {
    Vake: [[44.744,41.706],[44.758,41.691],[44.792,41.694],[44.806,41.710],[44.786,41.726],[44.755,41.724],[44.744,41.706]],
    Saburtalo: [[44.742,41.724],[44.772,41.714],[44.805,41.726],[44.801,41.750],[44.762,41.759],[44.742,41.724]],
    Vera: [[44.784,41.704],[44.797,41.700],[44.811,41.711],[44.805,41.722],[44.790,41.720],[44.784,41.704]],
    Mtatsminda: [[44.768,41.686],[44.792,41.680],[44.807,41.699],[44.790,41.710],[44.770,41.704],[44.768,41.686]],
    Digomi: [[44.754,41.760],[44.790,41.754],[44.814,41.779],[44.794,41.802],[44.756,41.791],[44.754,41.760]],
    'Didi Digomi': [[44.704,41.776],[44.748,41.760],[44.775,41.790],[44.748,41.818],[44.707,41.811],[44.704,41.776]],
    Bagebi: [[44.723,41.700],[44.755,41.691],[44.763,41.709],[44.742,41.720],[44.723,41.700]],
    'Nutsubidze Plateau': [[44.720,41.720],[44.756,41.712],[44.762,41.740],[44.730,41.748],[44.720,41.720]],
    Chavchavadze: [[44.755,41.703],[44.792,41.696],[44.797,41.707],[44.760,41.716],[44.755,41.703]],
    Didube: [[44.767,41.741],[44.796,41.733],[44.812,41.751],[44.798,41.766],[44.772,41.762],[44.767,41.741]],
    Gldani: [[44.796,41.780],[44.842,41.778],[44.856,41.814],[44.817,41.828],[44.791,41.808],[44.796,41.780]],
    Nadzaladevi: [[44.792,41.746],[44.822,41.741],[44.837,41.767],[44.811,41.778],[44.792,41.746]],
    Sololaki: [[44.792,41.686],[44.814,41.682],[44.820,41.697],[44.803,41.704],[44.792,41.686]],
    Avlabari: [[44.814,41.688],[44.837,41.690],[44.838,41.708],[44.817,41.711],[44.814,41.688]],
    Vashlijvari: [[44.711,41.742],[44.748,41.738],[44.758,41.762],[44.724,41.772],[44.711,41.742]],
    Krtsanisi: [[44.803,41.656],[44.833,41.657],[44.837,41.683],[44.811,41.689],[44.803,41.656]],
  };
  private map?: google.maps.Map;
  private draw?: import('terra-draw').TerraDraw;
  private streetLines: google.maps.Polyline[] = [];
  private selectionRevision = 0;
  private streetRevision = 0;
  private readonly boundaryCache = new Map<string, number[][][][]>();
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
    const drawableAreas = (await Promise.all(areas.map(async (area) => ({
      area,
      polygons: await this.loadBoundary(area),
    })))).filter((item) => item.polygons.length);
    if (revision !== this.selectionRevision) return;
    this.draw.clear();
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
  }

  private async loadBoundary(area: string): Promise<number[][][][]> {
    const cacheKey = `area:${area.toLowerCase()}`;
    const cached = this.boundaryCache.get(cacheKey);
    if (cached) return cached;
    try {
      const relationId = this.areaRelationIds[area];
      let geometry: { type: string; coordinates: unknown } | undefined;
      if (relationId) {
        const response = await fetch(
          `https://polygons.openstreetmap.fr/get_geojson.py?id=${relationId}&params=0`,
        );
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
        return await this.approximateStreetLine(street, district);
      }
    }))).flat();
    if (revision !== this.streetRevision) return;
    for (const path of paths) {
      const googlePath = path.map(([lng, lat]) => ({ lat, lng }));
      googlePath.forEach((point) => bounds.extend(point));
      this.streetLines.push(new google.maps.Polyline({
        map: this.map,
        path: googlePath,
        strokeColor: '#ffd400',
        strokeOpacity: 1,
        strokeWeight: 7,
        zIndex: 1000,
      }));
    }
    if (fitToStreets && !bounds.isEmpty()) this.map.fitBounds(bounds, 70);
  }

  private async loadStreetLines(street: string, district: string): Promise<number[][][]> {
    // API street labels commonly contain initials and "st./street/avenue" while
    // OSM stores the full name. The longest meaningful word (usually the
    // surname) gives a safe, district-scoped match.
    const response = await fetch(`/map-data/street?street=${encodeURIComponent(street)}`);
    if (!response.ok) throw new Error(`Street geometry service returned ${response.status}`);
    const payload = await response.json() as { lines?: number[][][] };
    let lines = payload.lines || [];
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

  private async approximateStreetLine(street: string, district: string): Promise<number[][][]> {
    try {
      const { Geocoder } = await importLibrary('geocoding') as google.maps.GeocodingLibrary;
      const geocoder = new Geocoder();
      const response = await geocoder.geocode({
        address: `${street}, ${district}, Tbilisi, Georgia`,
        bounds: new google.maps.LatLngBounds(
          { lat: 41.50, lng: 44.55 },
          { lat: 41.92, lng: 45.10 },
        ),
        region: 'GE',
      });
      const geometry = response.results[0]?.geometry;
      if (!geometry) return [];
      const viewport = geometry.viewport;
      const center = geometry.location;
      const northEast = viewport.getNorthEast();
      const southWest = viewport.getSouthWest();
      const longitudeSpan = Math.abs(northEast.lng() - southWest.lng());
      const latitudeSpan = Math.abs(northEast.lat() - southWest.lat());
      return longitudeSpan >= latitudeSpan
        ? [[
            [southWest.lng(), center.lat()],
            [center.lng(), center.lat()],
            [northEast.lng(), center.lat()],
          ]]
        : [[
            [center.lng(), southWest.lat()],
            [center.lng(), center.lat()],
            [center.lng(), northEast.lat()],
          ]];
    } catch (error) {
      console.error(`Google could not locate ${street}:`, error);
      return [];
    }
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
