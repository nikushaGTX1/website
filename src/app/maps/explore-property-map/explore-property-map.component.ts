import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import Supercluster from 'supercluster';
import { Apartment } from '../../models/apartment';

interface MapPoint {
  apartment: Apartment;
  lat: number;
  lng: number;
}

type MarkerKind = 'apartment' | 'cluster' | 'group';

interface PropertyMarker {
  key: string;
  kind: MarkerKind;
  apartment?: Apartment;
  marker: google.maps.marker.AdvancedMarkerElement;
  wrapper: HTMLDivElement;
  button: HTMLButtonElement;
  tail?: HTMLSpanElement;
}

/** Apartments closer than this (meters) are treated as the same building. */
const SAME_BUILDING_METERS = 25;

export interface PropertyMapPreviewAnchor {
  apartment: Apartment;
  x: number;
  y: number;
  markerWidth: number;
  markerHeight: number;
  mapWidth: number;
  mapHeight: number;
  fromClick: boolean;
}

@Component({
  selector: 'app-explore-property-map',
  standalone: false,
  templateUrl: './explore-property-map.component.html',
  styleUrl: './explore-property-map.component.css',
})
export class ExplorePropertyMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private static readonly defaultCenter: google.maps.LatLngLiteral = {
    lat: 41.7151,
    lng: 44.7833,
  };
  private static readonly defaultZoom = 12;
  private static readonly minimumZoom = 10;
  private static readonly georgiaBounds: google.maps.LatLngBoundsLiteral = {
    south: 41.05,
    west: 40.85,
    north: 43.75,
    east: 46.8,
  };
  private static readonly georgiaCameraBounds: google.maps.LatLngBoundsLiteral = {
    south: 40.9,
    west: 40.55,
    north: 43.9,
    east: 47.05,
  };
  @Input() apartments: Apartment[] = [];
  @Input() selectedApartmentId: number | null = null;
  @Output() apartmentSelected = new EventEmitter<Apartment>();
  @Output() mapClicked = new EventEmitter<void>();
  @Output() previewAnchorChanged = new EventEmitter<PropertyMapPreviewAnchor>();
  @Output() visibleApartmentsChanged = new EventEmitter<Apartment[]>();
  /** Several apartments share one building: the parent shows them in a group panel. */
  @Output() groupSelected = new EventEmitter<Apartment[]>();
  @ViewChild('mapCanvas') mapCanvas?: ElementRef<HTMLDivElement>;

  loading = true;
  errorMessage = '';
  settingsOpen = false;
  mapType: 'roadmap' | 'satellite' = 'roadmap';
  mappedApartmentCount = 0;

  private map?: google.maps.Map;
  private geocoder?: google.maps.Geocoder;
  private markers = new Map<string, PropertyMarker>();
  private points: MapPoint[] = [];
  private index?: Supercluster<{ id: number }, { id: number }>;
  private syncTimer?: number;
  private lastViewportKey = '';
  private pointsRevision = 0;
  private viewReady = false;
  private renderRevision = 0;
  private idleListener?: google.maps.MapsEventListener;
  private clickListener?: google.maps.MapsEventListener;
  private boundsListener?: google.maps.MapsEventListener;
  private mapResizeObserver?: ResizeObserver;
  private previewFrame?: number;
  private readonly geocodeCache = new Map<string, google.maps.LatLngLiteral | null>();
  private initialPropertyFocused = false;

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.initialize();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) return;
    // Filtering should update the pins without unexpectedly moving or zooming
    // the map. The initial load and the recenter control still fit all homes.
    if (changes['apartments'] && this.map) void this.rebuildPoints(false);
    if (changes['selectedApartmentId']) this.updateSelectedMarker();
  }

  ngOnDestroy(): void {
    this.renderRevision += 1;
    this.pointsRevision += 1;
    if (this.syncTimer) window.clearTimeout(this.syncTimer);
    this.idleListener?.remove();
    this.clickListener?.remove();
    this.boundsListener?.remove();
    this.mapResizeObserver?.disconnect();
    if (this.previewFrame) cancelAnimationFrame(this.previewFrame);
    this.clearMarkers();
  }

  setMapType(type: 'roadmap' | 'satellite'): void {
    this.mapType = type;
    this.map?.setMapTypeId(type);
    this.settingsOpen = false;
  }

  recenter(): void {
    this.fitVisibleProperties();
  }

  private async initialize(): Promise<void> {
    if (!this.mapCanvas) return;
    const apiKey = document
      .querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')
      ?.content.trim();
    const mapId = document
      .querySelector<HTMLMetaElement>('meta[name="google-maps-map-id"]')
      ?.content.trim();

    if (!apiKey) {
      this.loading = false;
      this.errorMessage = 'Google Maps is not configured.';
      this.refreshView();
      return;
    }

    try {
      setOptions({ key: apiKey, v: 'weekly', ...(mapId ? { mapIds: [mapId] } : {}) });
      const [{ Map }, { AdvancedMarkerElement }, { Geocoder }] = await Promise.all([
        importLibrary('maps') as Promise<google.maps.MapsLibrary>,
        importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
        importLibrary('geocoding') as Promise<google.maps.GeocodingLibrary>,
      ]);

      this.map = new Map(this.mapCanvas.nativeElement, {
        center: ExplorePropertyMapComponent.defaultCenter,
        zoom: ExplorePropertyMapComponent.defaultZoom,
        minZoom: ExplorePropertyMapComponent.minimumZoom,
        ...(mapId ? { mapId } : {}),
        mapTypeId: this.mapType,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
        zoomControl: true,
        restriction: {
          latLngBounds: ExplorePropertyMapComponent.georgiaCameraBounds,
          // Google's elastic boundary keeps Georgia centered without exposing
          // the clipped/blank edge produced when a wide map meets strict bounds.
          strictBounds: false,
        },
      });

      this.clickListener = this.map.addListener('click', () => {
        this.zone.run(() => this.mapClicked.emit());
      });
      // 'idle' fires once the pan/zoom has finished, so nothing runs while dragging.
      // The short debounce merges the idle events of rapid consecutive gestures.
      this.idleListener = this.map.addListener('idle', () => {
        if (this.syncTimer) window.clearTimeout(this.syncTimer);
        this.syncTimer = window.setTimeout(() => {
          this.syncTimer = undefined;
          this.syncMarkers();
          this.zone.run(() => {
            this.emitVisibleApartments();
            this.emitSelectedPreviewAnchor();
          });
        }, 60);
      });
      this.boundsListener = this.map.addListener('bounds_changed', () => {
        if (this.previewFrame) cancelAnimationFrame(this.previewFrame);
        this.previewFrame = requestAnimationFrame(() => {
          this.previewFrame = undefined;
          this.zone.run(() => this.emitSelectedPreviewAnchor());
        });
      });

      // The surrounding layout can still be animating/reflowing when the map
      // first mounts, which locks Google Maps into whatever size it saw at
      // that instant. Re-measure whenever the container's real size changes.
      let lastMapSize = '';
      this.mapResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || !this.map) return;
        const size = `${entry.contentRect.width}x${entry.contentRect.height}`;
        if (size === lastMapSize) return;
        lastMapSize = size;
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        google.maps.event.trigger(this.map, 'resize');
        if (center) this.map.setCenter(center);
        if (zoom !== undefined) this.map.setZoom(zoom);
      });
      this.mapResizeObserver.observe(this.mapCanvas.nativeElement);

      // Keep the constructor available without loading the marker library again.
      this.advancedMarkerConstructor = AdvancedMarkerElement;
      this.geocoder = new Geocoder();
      await this.rebuildPoints(true);
    } catch (error) {
      console.error('Explore map failed to load:', error);
      this.errorMessage = 'The property map could not be loaded.';
    } finally {
      this.loading = false;
      this.refreshView();
    }
  }

  private advancedMarkerConstructor?: typeof google.maps.marker.AdvancedMarkerElement;

  /** Resolves every apartment's position once, then (re)builds the cluster index. */
  private async rebuildPoints(fitBounds: boolean): Promise<void> {
    if (!this.map || !this.advancedMarkerConstructor) return;
    const revision = ++this.pointsRevision;

    // Resolve positions in small batches so listings without stored coordinates
    // (which may need geocoding) never open dozens of requests at once.
    const points: MapPoint[] = [];
    const batchSize = 12;
    for (let start = 0; start < this.apartments.length; start += batchSize) {
      const batch = this.apartments.slice(start, start + batchSize);
      const resolved = await Promise.all(
        batch.map(async (apartment) => ({ apartment, position: await this.resolvePosition(apartment) })),
      );
      if (revision !== this.pointsRevision) return; // a newer filter/result set replaced this one
      for (const { apartment, position } of resolved) {
        if (position) points.push({ apartment, lat: position.lat, lng: position.lng });
      }
    }
    if (revision !== this.pointsRevision) return;

    this.points = points;
    // maxZoom is above the map's zoom limit, so apartments at the same spot always stay
    // in one cluster (a building) instead of being spread over each other.
    const index = new Supercluster<{ id: number }, { id: number }>({
      radius: 100,
      minZoom: 0,
      maxZoom: 24,
      minPoints: 2,
      nodeSize: 64,
    });
    index.load(
      points.map((point) => ({
        type: 'Feature' as const,
        properties: { id: point.apartment.id },
        geometry: { type: 'Point' as const, coordinates: [point.lng, point.lat] },
      })),
    );
    this.index = index;
    this.mappedApartmentCount = points.length;
    this.lastViewportKey = '';

    if (fitBounds) this.fitVisibleProperties();
    this.syncMarkers();
    this.refreshView();
  }

  /** Renders only what the current viewport and zoom need: clusters, buildings and single prices. */
  private syncMarkers(): void {
    if (!this.map || !this.index || !this.advancedMarkerConstructor) return;
    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    if (!bounds || zoom === undefined) return;

    const north = bounds.getNorthEast().lat();
    const east = bounds.getNorthEast().lng();
    const south = bounds.getSouthWest().lat();
    const west = bounds.getSouthWest().lng();
    // Query slightly beyond the viewport so small pans do not reveal empty edges.
    const latPad = (north - south) * 0.15;
    const lngPad = (east - west) * 0.15;
    const bbox: [number, number, number, number] = [
      Math.max(-180, west - lngPad),
      Math.max(-85, south - latPad),
      Math.min(180, east + lngPad),
      Math.min(85, north + latPad),
    ];
    const clusterZoom = Math.min(24, Math.max(0, Math.floor(zoom)));
    const key = [bbox.map((v) => v.toFixed(5)).join(','), clusterZoom, this.points.length, this.pointsRevision].join('|');
    if (key === this.lastViewportKey) return;
    this.lastViewportKey = key;

    const features = this.index.getClusters(bbox, clusterZoom);
    const wanted = new Map<string, () => PropertyMarker>();

    for (const feature of features) {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: number };
      if (props.cluster && props.cluster_id !== undefined) {
        const clusterId = props.cluster_id;
        const count = props.point_count || 0;
        const isBuilding = this.isSameBuilding(clusterId);
        const markerKey = (isBuilding ? 'g:' : 'c:') + clusterId + ':' + count;
        wanted.set(markerKey, () => this.createClusterMarker(markerKey, clusterId, count, isBuilding, { lat, lng }));
      } else if (props.id !== undefined) {
        const point = this.pointById(props.id);
        if (!point) continue;
        const markerKey = 'a:' + point.apartment.id;
        wanted.set(markerKey, () => this.createApartmentMarker(markerKey, point));
      }
    }

    // Keep markers that are still wanted (no flicker), drop the rest, add the new ones.
    for (const [markerKey, entry] of this.markers) {
      if (!wanted.has(markerKey)) {
        entry.marker.map = null;
        this.markers.delete(markerKey);
      }
    }
    for (const [markerKey, factory] of wanted) {
      if (!this.markers.has(markerKey)) this.markers.set(markerKey, factory());
    }
    this.updateSelectedMarker();
  }

  private pointsById?: Map<number, MapPoint>;
  private pointsByIdRevision = -1;

  private pointById(id: number): MapPoint | undefined {
    if (this.pointsByIdRevision !== this.pointsRevision || !this.pointsById) {
      this.pointsById = new Map(this.points.map((point) => [point.apartment.id, point]));
      this.pointsByIdRevision = this.pointsRevision;
    }
    return this.pointsById.get(id);
  }

  /** True when a cluster cannot be separated by zooming: same coordinates or the same building. */
  private isSameBuilding(clusterId: number): boolean {
    if (!this.index) return false;
    if (this.index.getClusterExpansionZoom(clusterId) > 20) return true;
    const leaves = this.index.getLeaves(clusterId, 60);
    if (leaves.length < 2) return false;
    const [firstLng, firstLat] = leaves[0].geometry.coordinates;
    return leaves.every((leaf) => {
      const [lng, lat] = leaf.geometry.coordinates;
      return this.distanceMeters(firstLat, firstLng, lat, lng) <= SAME_BUILDING_METERS;
    });
  }

  private distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
  }

  private createApartmentMarker(key: string, point: MapPoint): PropertyMarker {
    const apartment = point.apartment;
    const { wrapper, button, tail } = this.createPricePin(apartment);
    const marker = new this.advancedMarkerConstructor!({
      map: this.map,
      position: { lat: point.lat, lng: point.lng },
      content: wrapper,
      zIndex: apartment.id === this.selectedApartmentId ? 100 : 1,
    });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.zone.run(() => this.emitPreviewAnchor(apartment, button, true));
    });
    const showHoverState = () => this.setMarkerHoverState(apartment.id, true);
    const hideHoverState = () => this.setMarkerHoverState(apartment.id, false);
    button.addEventListener('pointerenter', showHoverState);
    button.addEventListener('pointerleave', hideHoverState);
    button.addEventListener('focus', showHoverState);
    button.addEventListener('blur', hideHoverState);
    return { key, kind: 'apartment', apartment, marker, wrapper, button, tail };
  }

  private createClusterMarker(
    key: string,
    clusterId: number,
    count: number,
    isBuilding: boolean,
    position: google.maps.LatLngLiteral,
  ): PropertyMarker {
    // Bigger clusters get a bigger disc; 44px is the minimum comfortable touch target.
    const size = Math.round(Math.min(66, 44 + Math.log10(Math.max(count, 1)) * 12));
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = count > 999 ? '999+' : String(count);
    button.setAttribute(
      'aria-label',
      isBuilding ? count + ' homes in this building' : count + ' homes, zoom in to see them',
    );
    Object.assign(button.style, {
      width: size + 'px',
      height: size + 'px',
      display: 'grid',
      placeItems: 'center',
      border: '3px solid rgba(255,255,255,.95)',
      borderRadius: isBuilding ? '14px' : '50%',
      background: isBuilding ? '#171421' : '#451a8f',
      color: '#fff',
      boxShadow: '0 6px 18px rgba(25, 16, 31, .32)',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      fontSize: count > 99 ? '14px' : '16px',
      fontWeight: '800',
      lineHeight: '1',
      cursor: 'pointer',
      outline: 'none',
      transition: 'transform .16s ease, box-shadow .16s ease',
      touchAction: 'manipulation',
    });
    button.addEventListener('pointerenter', () => (button.style.transform = 'scale(1.08)'));
    button.addEventListener('pointerleave', () => (button.style.transform = ''));
    button.addEventListener('click', (event) => {
      // A cluster click must not reach the map: it would count as a click on empty map.
      event.stopPropagation();
      this.zone.run(() => this.onClusterClicked(clusterId, isBuilding, position));
    });
    wrapper.appendChild(button);
    const marker = new this.advancedMarkerConstructor!({
      map: this.map,
      position,
      content: wrapper,
      zIndex: 5,
    });
    return { key, kind: isBuilding ? 'group' : 'cluster', marker, wrapper, button };
  }

  private onClusterClicked(clusterId: number, isBuilding: boolean, position: google.maps.LatLngLiteral): void {
    if (!this.index || !this.map) return;
    if (isBuilding) {
      const ids = this.index.getLeaves(clusterId, Infinity).map((leaf) => (leaf.properties as { id: number }).id);
      const apartments = ids
        .map((id) => this.pointById(id)?.apartment)
        .filter((apartment): apartment is Apartment => !!apartment)
        .sort((a, b) => a.price - b.price);
      this.groupSelected.emit(apartments);
      return;
    }
    const target = Math.min(this.index.getClusterExpansionZoom(clusterId), 20);
    this.map.moveCamera({ center: position, zoom: Math.max(target, (this.map.getZoom() || 0) + 1) });
  }

  private createPricePin(apartment: Apartment, offsetX = 0): {
    wrapper: HTMLDivElement;
    button: HTMLButtonElement;
    tail: HTMLSpanElement;
  } {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'relative',
      transform: `translateX(${offsetX}px)`,
      overflow: 'visible',
    });
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = this.compactPrice(apartment.price);
    button.setAttribute(
      'aria-label',
      `Select ${apartment.title || 'property'} at ${button.textContent}`,
    );
    Object.assign(button.style, {
      position: 'relative',
      minWidth: '58px',
      height: '34px',
      padding: '0 11px',
      border: '1px solid rgba(60, 48, 67, .18)',
      borderRadius: '18px',
      background: '#fff',
      color: '#171421',
      boxShadow: '0 5px 14px rgba(25, 16, 31, .22)',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      fontSize: '11px',
      fontWeight: '800',
      lineHeight: '1',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      transform: 'translateY(-9px)',
      transformOrigin: 'center bottom',
      outline: 'none',
      transition:
        'transform .18s ease, background .18s ease, color .18s ease, box-shadow .18s ease',
    });
    const tail = document.createElement('span');
    Object.assign(tail.style, {
      position: 'absolute',
      bottom: '-5px',
      left: '50%',
      width: '9px',
      height: '9px',
      background: '#fff',
      transform: 'translateX(-50%) rotate(45deg)',
      transition: 'background .18s ease',
      zIndex: '-1',
    });
    button.appendChild(tail);
    wrapper.appendChild(button);
    return { wrapper, button, tail };
  }

  private positionKey(position: google.maps.LatLngLiteral): string {
    return `${position.lat.toFixed(5)},${position.lng.toFixed(5)}`;
  }

  private async resolvePosition(apartment: Apartment): Promise<google.maps.LatLngLiteral | null> {
    const lat = Number(apartment.propertyLatitude ?? apartment.latitude);
    const lng = Number(apartment.propertyLongitude ?? apartment.longitude);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180 &&
      this.isInsideGeorgia(lat, lng)
    ) {
      return { lat, lng };
    }

    const normalizedStreet = this.normalizeStreetName(apartment.street || '');
    const normalizedAddress = this.normalizeStreetName(apartment.address || '');
    const districtFallback = this.resolveDistrictPosition(apartment);

    // Public listings can intentionally omit their precise street and point.
    // In that case, do not wait for remote geocoding: place the marker at the
    // saved district immediately so the initial camera always has a target.
    if (!normalizedStreet && districtFallback) {
      return districtFallback;
    }
    const addresses = [
      [
        [apartment.buildingNumber, normalizedStreet].filter(Boolean).join(' '),
        apartment.district,
        apartment.city || 'Tbilisi',
        'Georgia',
      ]
        .filter(Boolean)
        .join(', '),
      [normalizedAddress, apartment.city || 'Tbilisi', 'Georgia'].filter(Boolean).join(', '),
    ].filter((value, index, values) => value && values.indexOf(value) === index);
    const cacheKey = addresses.join('|');
    if (!cacheKey) return null;
    if (this.geocodeCache.has(cacheKey)) return this.geocodeCache.get(cacheKey) ?? null;

    if (this.geocoder) {
      for (const address of addresses) {
        try {
          const result = await this.geocoder.geocode({
            address,
            bounds: ExplorePropertyMapComponent.georgiaBounds,
            componentRestrictions: { country: 'GE' },
            region: 'GE',
          });
          const location = result.results[0]?.geometry.location;
          if (location && this.isInsideGeorgia(location.lat(), location.lng())) {
            const position = { lat: location.lat(), lng: location.lng() };
            this.geocodeCache.set(cacheKey, position);
            return position;
          }
        } catch {
          // The hosted Maps key may disallow client-side geocoding. The
          // same-origin street geometry fallback below still places the home.
        }
      }
    }

    const streetPosition = await this.resolveStreetPosition(normalizedStreet);
    const fallbackPosition = streetPosition || districtFallback;
    this.geocodeCache.set(cacheKey, fallbackPosition);
    return fallbackPosition;
  }

  private resolveDistrictPosition(apartment: Apartment): google.maps.LatLngLiteral | null {
    const districtCenters: Record<string, google.maps.LatLngLiteral> = {
      vake: { lat: 41.7085, lng: 44.7565 },
      saburtalo: { lat: 41.7257, lng: 44.7478 },
      vera: { lat: 41.7072, lng: 44.7832 },
      mtatsminda: { lat: 41.6958, lng: 44.7908 },
      didube: { lat: 41.7492, lng: 44.7782 },
      digomi: { lat: 41.7837, lng: 44.7551 },
      'didi digomi': { lat: 41.7948, lng: 44.7428 },
      gldani: { lat: 41.7952, lng: 44.8177 },
      nadzaladevi: { lat: 41.7571, lng: 44.799 },
      isani: { lat: 41.6875, lng: 44.8352 },
      samgori: { lat: 41.6896, lng: 44.8618 },
      avlabari: { lat: 41.6936, lng: 44.8155 },
      sololaki: { lat: 41.6895, lng: 44.8005 },
      chugureti: { lat: 41.714, lng: 44.8065 },
      krtsanisi: { lat: 41.6726, lng: 44.817 },
    };
    const key = (apartment.district || '').trim().toLowerCase();
    const center = districtCenters[key];
    if (!center) return null;

    // Slightly separate privacy-redacted homes in the same district so each
    // price remains visible without implying an exact building location.
    const angle = ((apartment.id * 137.5) % 360) * (Math.PI / 180);
    const radius = 0.002 + (apartment.id % 3) * 0.0007;
    return {
      lat: center.lat + Math.sin(angle) * radius,
      lng: center.lng + Math.cos(angle) * radius,
    };
  }

  private normalizeStreetName(value: string): string {
    return value
      .trim()
      .replace(/\b(?:mckheta|mcxeta|mtsxeta)\b/gi, 'Mtskheta')
      .replace(/\bst\.?\b/gi, 'Street')
      .replace(/\s+/g, ' ');
  }

  private async resolveStreetPosition(street: string): Promise<google.maps.LatLngLiteral | null> {
    if (!street) return null;
    try {
      const response = await fetch(
        `/map-data/street?street=${encodeURIComponent(street)}&bbox=41.05,40.85,43.75,46.80`,
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as { lines?: number[][][] };
      const longestLine = [...(payload.lines || [])].sort(
        (left, right) => right.length - left.length,
      )[0];
      if (!longestLine?.length) return null;
      const point = longestLine[Math.floor(longestLine.length / 2)];
      const [lng, lat] = point || [];
      return Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        this.isInsideGeorgia(lat, lng)
        ? { lat, lng }
        : null;
    } catch {
      return null;
    }
  }

  private isInsideGeorgia(lat: number, lng: number): boolean {
    const bounds = ExplorePropertyMapComponent.georgiaBounds;
    return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
  }

  private apartmentMarkers(): PropertyMarker[] {
    return [...this.markers.values()].filter((item) => item.kind === 'apartment' && item.apartment);
  }

  private updateSelectedMarker(): void {
    for (const item of this.apartmentMarkers()) {
      const selected = item.apartment!.id === this.selectedApartmentId;
      item.button.style.background = selected ? '#451a8f' : '#fff';
      item.button.style.color = selected ? '#fff' : '#171421';
      item.button.style.transform = selected ? 'translateY(-9px) scale(1.1)' : 'translateY(-9px)';
      item.button.style.boxShadow = selected
        ? '0 9px 22px rgba(69, 26, 143, .32)'
        : '0 5px 14px rgba(25, 16, 31, .22)';
      if (item.tail) item.tail.style.background = selected ? '#451a8f' : '#fff';
      item.marker.zIndex = selected ? 100 : 1;
    }
  }

  private setMarkerHoverState(apartmentId: number, hovered: boolean): void {
    const item = this.markers.get('a:' + apartmentId);
    if (!item || !item.tail) return;

    const selected = apartmentId === this.selectedApartmentId;
    item.button.style.background = selected ? '#451a8f' : '#fff';
    item.button.style.color = selected ? '#fff' : '#171421';
    item.button.style.transform = hovered
      ? 'translateY(-15px) scale(' + (selected ? '1.1' : '1.04') + ')'
      : selected
        ? 'translateY(-9px) scale(1.1)'
        : 'translateY(-9px)';
    item.button.style.boxShadow = hovered || selected
      ? '0 9px 22px rgba(69, 26, 143, .32)'
      : '0 5px 14px rgba(25, 16, 31, .22)';
    item.tail.style.background = selected ? '#451a8f' : '#fff';
    item.marker.zIndex = hovered ? 101 : selected ? 100 : 1;
  }

  private emitSelectedPreviewAnchor(): void {
    const selected = this.selectedApartmentId === null ? undefined : this.markers.get('a:' + this.selectedApartmentId);
    if (selected?.apartment) requestAnimationFrame(() => this.emitPreviewAnchor(selected.apartment!, selected.button));
  }

  private emitPreviewAnchor(
    apartment: Apartment,
    button: HTMLButtonElement,
    fromClick = false,
  ): void {
    const mapElement = this.mapCanvas?.nativeElement;
    if (!mapElement) return;
    const mapRect = mapElement.getBoundingClientRect();
    const markerRect = button.getBoundingClientRect();
    this.previewAnchorChanged.emit({
      apartment,
      x: markerRect.left - mapRect.left + markerRect.width / 2,
      y: markerRect.top - mapRect.top + markerRect.height / 2,
      markerWidth: markerRect.width,
      markerHeight: markerRect.height,
      mapWidth: mapRect.width,
      mapHeight: mapRect.height,
      fromClick,
    });
  }

  private fitVisibleProperties(): void {
    if (!this.map || !this.points.length) return;
    // Ignore far-away outliers (a listing in another city) so the first view is the main area.
    const lats = this.points.map((point) => point.lat).sort((a, b) => a - b);
    const lngs = this.points.map((point) => point.lng).sort((a, b) => a - b);
    const trim = this.points.length >= 20 ? Math.floor(this.points.length * 0.04) : 0;
    const south = lats[trim];
    const north = lats[lats.length - 1 - trim];
    const west = lngs[trim];
    const east = lngs[lngs.length - 1 - trim];
    if (this.points.length === 1 || (north - south < 0.0005 && east - west < 0.0005)) {
      this.map.setCenter({ lat: (north + south) / 2, lng: (east + west) / 2 });
      this.map.setZoom(15);
      return;
    }
    this.map.fitBounds({ south, west, north, east }, 70);
    google.maps.event.addListenerOnce(this.map, 'idle', () => {
      const zoom = this.map?.getZoom() || 0;
      if (zoom > 16) this.map?.setZoom(16);
      if (zoom < ExplorePropertyMapComponent.minimumZoom) {
        this.map?.setZoom(ExplorePropertyMapComponent.minimumZoom);
      }
    });
  }

  private emitVisibleApartments(): void {
    const bounds = this.map?.getBounds();
    // Do not replace the loaded results with an empty list during the map's
    // first idle event, before async geocoding has produced its points.
    if (!bounds || !this.points.length) return;
    const visible = this.points
      .filter((point) => bounds.contains({ lat: point.lat, lng: point.lng }))
      .map((point) => point.apartment);
    this.visibleApartmentsChanged.emit(visible);
    this.refreshView();
  }

  private clearMarkers(): void {
    this.markers.forEach((item) => (item.marker.map = null));
    this.markers.clear();
  }

  private compactPrice(price: number): string {
    if (price >= 1_000_000) return `$${Number((price / 1_000_000).toFixed(1))}M`;
    if (price >= 1_000) return `$${Number((price / 1_000).toFixed(1))}K`;
    return `$${Math.round(price).toLocaleString('en-US')}`;
  }

  private refreshView(): void {
    this.zone.run(() => this.cdr.detectChanges());
  }
}
