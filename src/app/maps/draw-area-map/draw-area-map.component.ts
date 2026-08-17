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
import { PersistentDataCache } from '../../utils/persistent-data-cache';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-draw-area-map',
  standalone: false,
  templateUrl: './draw-area-map.component.html',
  styleUrl: './draw-area-map.component.css',
})
export class DrawAreaMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private static readonly persistentMapCache = new PersistentDataCache(
    // v2 ignores broad street-search results cached by the previous matcher.
    'map-geometry-v3',
    180 * 24 * 60 * 60 * 1000,
  );
  private static readonly sharedBoundaryCache = new Map<string, number[][][][]>();
  private static readonly boundaryRequests = new Map<string, Promise<number[][][][]>>();
  @Input() visible = false;
  @Input() compact = false;
  @Input() selectedAreaInput = '';
  @Input() selectedAreasInput: string[] = [];
  @Input() selectedStreetsInput: Array<{ streetId: number; street: string; district: string }> = [];
  @HostBinding('class.is-hidden') get isHidden(): boolean { return !this.visible; }
  @HostBinding('class.is-compact') get isCompact(): boolean { return this.compact; }
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('compactMapContainer') compactMapContainer?: ElementRef<HTMLDivElement>;
  @Output() close = new EventEmitter<void>();
  @Output() apply = new EventEmitter<GeoJsonPolygon>();
  @Output() polygonChange = new EventEmitter<GeoJsonPolygon | null>();
  @Output() drawnStreetsChange = new EventEmitter<Array<{ id: number; label: string; value: string; district: string }>>();
  @Output() detectedAreaChange = new EventEmitter<string>();

  loading = true;
  errorMessage = '';
  hasPolygon = false;
  compactMapInteractive = false;
  areaSearch = '';
  streetSearch = '';
  selectedArea = '';
  selectedStreet = '';
  selectedStreetId: number | null = null;
  streetStep = false;
  locations: ApiLocation[] = [];
  searchMode: 'rent' | 'buy' = 'rent';
  propertyType = '';
  budget: number | null = null;
  bedrooms = '';
  validationMessage = '';
  readonly propertyTypes = ['Apartament', 'House', 'Commercial Place', 'Country house'];
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
  private drawnAreaRevision = 0;
  private preserveDrawnPolygonOnInputChange = false;
  private usesCloudMapStyle = false;
  private readonly boundaryCache = DrawAreaMapComponent.sharedBoundaryCache;
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

  private setLegacyMapStyles(styles: google.maps.MapTypeStyle[] | null): void {
    // A map ID receives its style from Google Cloud. Passing JSON styles as
    // well is unsupported and causes the Maps API warning seen in development.
    if (!this.usesCloudMapStyle) this.map?.setOptions({ styles });
  }

  clearArea(): void {
    this.drawnAreaRevision++;
    this.draw?.clear();
    this.hasPolygon = false;
    this.selectedArea = '';
    this.selectedStreet = '';
    this.selectedStreetId = null;
    this.streetStep = false;
    this.draw?.setMode('polyline');
    this.polygonChange.emit(null);
    this.drawnStreetsChange.emit([]);
    this.clearStreetLines();
    this.setLegacyMapStyles(null);
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

  get selectedAreaStreets(): Array<{ id: number; label: string; value: string }> {
    const entry = this.locations.find((location) =>
      location.district.toLowerCase() === this.selectedArea.toLowerCase(),
    );
    const streets = entry ? this.locationService.streetNames(entry, 'en') : [];
    const query = this.streetSearch.trim().toLowerCase();
    return streets.filter((street) =>
      !query || street.label.toLowerCase().includes(query) || street.value.toLowerCase().includes(query),
    );
  }

  get popularStreets(): Array<{ id: number; label: string; value: string }> {
    return this.selectedAreaStreets.slice(0, 6);
  }

  async selectStreet(street: { id: number; label: string; value: string }): Promise<void> {
    this.errorMessage = '';
    this.selectedStreet = street.value;
    this.selectedStreetId = street.id;
    this.streetSearch = '';
    const revision = ++this.streetRevision;
    try {
      const record = await firstValueFrom(this.locationService.getStreet(street.id));
      if (revision !== this.streetRevision) return;
      const paths = record.geometry.type === 'LineString'
        ? [record.geometry.coordinates as number[][]]
        : record.geometry.coordinates as number[][][];
      this.clearStreetLines();
      this.renderStreetPaths(paths, true);
    } catch {
      if (revision !== this.streetRevision) return;
      this.selectedStreet = '';
      this.selectedStreetId = null;
      this.errorMessage = 'Street geometry is not approved.';
    }
  }

  backToAreas(): void {
    this.streetStep = false;
    this.selectedStreet = '';
    this.selectedStreetId = null;
    this.streetSearch = '';
  }

  chooseArea(area: string): void {
    void this.chooseAreas([area]);
  }

  async chooseAreas(areas: string[]): Promise<void> {
    if (!this.draw || !this.map) return;
    this.drawnAreaRevision++;
    const revision = ++this.selectionRevision;
    // Remove the old district immediately. Otherwise it remains visible while
    // the newly selected OSM boundary is being downloaded.
    this.draw.clear();
    this.clearStreetLines();
    this.hasPolygon = false;
    this.selectedArea = '';
    this.selectedStreet = '';
    this.selectedStreetId = null;
    this.setLegacyMapStyles([
      { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ]);
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
    // Street geometry is fetched only by canonical street ID after selection.
    // Selecting a district must not preload or fuzzy-resolve road names.
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
    this.drawnAreaRevision++;
    this.selectionRevision++;
    this.draw?.clear();
    this.clearStreetLines();
    this.selectedArea = '';
    this.selectedStreet = '';
    this.selectedStreetId = null;
    this.hasPolygon = false;
    this.draw?.setMode('polyline');
    this.polygonChange.emit(null);
    this.drawnStreetsChange.emit([]);
    this.setLegacyMapStyles(null);
  }

  private async loadBoundary(area: string): Promise<number[][][][]> {
    const cacheKey = `area:${area.toLowerCase()}`;
    const cached = this.boundaryCache.get(cacheKey);
    if (cached) return cached;
    const pending = DrawAreaMapComponent.boundaryRequests.get(cacheKey);
    if (pending) return pending;
    const request = this.loadPersistedBoundary(area, cacheKey)
      .finally(() => DrawAreaMapComponent.boundaryRequests.delete(cacheKey));
    DrawAreaMapComponent.boundaryRequests.set(cacheKey, request);
    return request;
  }

  private async loadPersistedBoundary(area: string, cacheKey: string): Promise<number[][][][]> {
    const persisted = await DrawAreaMapComponent.persistentMapCache.get<number[][][][]>(
      `boundary:${cacheKey}`,
    );
    if (persisted?.length) {
      this.boundaryCache.set(cacheKey, persisted);
      return persisted;
    }
    const polygons = await this.fetchBoundary(area, cacheKey);
    if (polygons.length) {
      await DrawAreaMapComponent.persistentMapCache.set(
        `boundary:${cacheKey}`,
        polygons,
      );
    }
    return polygons;
  }

  private async fetchBoundary(area: string, cacheKey: string): Promise<number[][][][]> {
    try {
      const areaRecord = this.locations.find((location) =>
        location.district.toLowerCase() === area.toLowerCase() ||
        this.locationService.districtName(location, 'ka').toLowerCase() === area.toLowerCase());
      if (!areaRecord) return [];
      if (areaRecord.geometryStatus !== 'approved') {
        this.errorMessage = `${area} boundary is awaiting verification.`;
        return [];
      }
      const response = await firstValueFrom(this.locationService.getArea(areaRecord.id));
      if (!response.geometry) {
        this.errorMessage = `${area} boundary is awaiting verification.`;
        return [];
      }
      const geometry = response.geometry;
      const polygons = this.geoJsonPolygons(geometry);
      this.errorMessage = '';
      this.boundaryCache.set(cacheKey, polygons);
      return polygons;
    } catch {
      this.errorMessage = `${area} boundary could not be loaded.`;
      return [];
    }
  }

  private async drawSelectedStreets(fitToStreets = true): Promise<void> {
    if (!this.map) return;
    const revision = ++this.streetRevision;
    this.clearStreetLines();
    if (!this.selectedStreetsInput.length) return;
    const paths = (await Promise.all(this.selectedStreetsInput.map(async (selection) => {
      const street = await firstValueFrom(this.locationService.getStreet(selection.streetId));
      return street.geometry.type === 'LineString'
        ? [street.geometry.coordinates as number[][]]
        : street.geometry.coordinates as number[][][];
    }))).flat();
    if (revision !== this.streetRevision) return;
    this.clearStreetLines();
    this.renderStreetPaths(paths, fitToStreets);
  }

  private renderStreetPaths(paths: number[][][], fitToStreets: boolean): void {
    if (!this.map) return;
    const bounds = new google.maps.LatLngBounds();
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

  private clearStreetLines(): void {
    this.streetLines.forEach((line) => line.setMap(null));
    this.streetLines = [];
  }

  private geoJsonPolygons(geometry?: { type: string; coordinates: unknown }): number[][][][] {
    if (!geometry) return [];
    if (geometry.type === 'Polygon') return [geometry.coordinates as number[][][]];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates as number[][][][];
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
      streetId: this.selectedStreetId || undefined,
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
    const mapId = document
      .querySelector<HTMLMetaElement>('meta[name="google-maps-map-id"]')
      ?.content.trim();
    this.usesCloudMapStyle = !!mapId;

    const mapElement = this.compact ? this.compactMapContainer : this.mapContainer;
    if (!apiKey || !mapElement) {
      this.errorMessage = 'Google Maps is not configured.';
      this.loading = false;
      return;
    }

    try {
      setOptions({
        key: apiKey,
        v: 'weekly',
        ...(mapId ? { mapIds: [mapId] } : {}),
      });
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
        ...(mapId ? { mapId } : {}),
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
    const revision = ++this.drawnAreaRevision;
    try {
      const ring = polygon.coordinates[0];
      const center = ring.reduce(
        (sum, [longitude, latitude]) => [sum[0] + longitude, sum[1] + latitude],
        [0, 0],
      ).map((value) => value / ring.length);
      const [area, streets] = await Promise.all([
        firstValueFrom(this.locationService.resolvePoint(center[1], center[0])).catch(() => null),
        firstValueFrom(this.locationService.getIntersectingStreets(polygon.coordinates)),
      ]);
      if (revision !== this.drawnAreaRevision) return;
      const detectedArea = area?.nameEn || '';
      this.preserveDrawnPolygonOnInputChange = !!detectedArea;
      this.detectedAreaChange.emit(detectedArea);
      const useGeorgian = document.documentElement.lang === 'ka';
      const matches = streets
        .map((street) => {
          return {
            id: street.id,
            label: useGeorgian && street.nameKa ? street.nameKa : street.nameEn,
            value: street.nameEn,
            district: street.district,
          };
        })
        .filter((street, index, list) => list.findIndex((item) => item.id === street.id) === index)
        .sort((left, right) => left.label.localeCompare(right.label, useGeorgian ? 'ka' : 'en'));
      this.drawnStreetsChange.emit(matches);
      this.cdr.detectChanges();
    } catch {
      if (revision !== this.drawnAreaRevision) return;
      this.drawnStreetsChange.emit([]);
      this.cdr.detectChanges();
    }
  }

}
