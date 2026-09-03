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
import { Apartment } from '../../models/apartment';

interface PropertyMarker {
  apartment: Apartment;
  marker: google.maps.marker.AdvancedMarkerElement;
  wrapper: HTMLDivElement;
  button: HTMLButtonElement;
  tail: HTMLSpanElement;
}

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
  @Output() previewAnchorChanged = new EventEmitter<PropertyMapPreviewAnchor>();
  @Output() visibleApartmentsChanged = new EventEmitter<Apartment[]>();
  @ViewChild('mapCanvas') mapCanvas?: ElementRef<HTMLDivElement>;

  loading = true;
  errorMessage = '';
  settingsOpen = false;
  mapType: 'roadmap' | 'satellite' = 'roadmap';
  mappedApartmentCount = 0;

  private map?: google.maps.Map;
  private geocoder?: google.maps.Geocoder;
  private markers: PropertyMarker[] = [];
  private viewReady = false;
  private renderRevision = 0;
  private idleListener?: google.maps.MapsEventListener;
  private boundsListener?: google.maps.MapsEventListener;
  private previewFrame?: number;
  private readonly geocodeCache = new Map<string, google.maps.LatLngLiteral | null>();

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
    if (changes['apartments'] && this.map) void this.renderMarkers(true);
    if (changes['selectedApartmentId']) this.updateSelectedMarker();
  }

  ngOnDestroy(): void {
    this.renderRevision += 1;
    this.idleListener?.remove();
    this.boundsListener?.remove();
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
        center: { lat: 42.1, lng: 43.5 },
        zoom: 7,
        minZoom: 7,
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

      this.idleListener = this.map.addListener('idle', () => {
        this.zone.run(() => {
          this.emitVisibleApartments();
          this.emitSelectedPreviewAnchor();
        });
      });
      this.boundsListener = this.map.addListener('bounds_changed', () => {
        if (this.previewFrame) cancelAnimationFrame(this.previewFrame);
        this.previewFrame = requestAnimationFrame(() => {
          this.previewFrame = undefined;
          this.zone.run(() => this.emitSelectedPreviewAnchor());
        });
      });

      // Keep the constructor available without loading the marker library again.
      this.advancedMarkerConstructor = AdvancedMarkerElement;
      this.geocoder = new Geocoder();
      await this.renderMarkers(true);
    } catch (error) {
      console.error('Explore map failed to load:', error);
      this.errorMessage = 'The property map could not be loaded.';
    } finally {
      this.loading = false;
      this.refreshView();
    }
  }

  private advancedMarkerConstructor?: typeof google.maps.marker.AdvancedMarkerElement;

  private async renderMarkers(fitBounds: boolean): Promise<void> {
    if (!this.map || !this.advancedMarkerConstructor) return;
    const revision = ++this.renderRevision;
    this.clearMarkers();

    const locatedApartments = (
      await Promise.all(
        this.apartments.map(async (apartment) => ({
          apartment,
          position: await this.resolvePosition(apartment),
        })),
      )
    ).filter(
      (item): item is { apartment: Apartment; position: google.maps.LatLngLiteral } =>
        item.position !== null,
    );

    if (revision !== this.renderRevision) return;
    const positionCounts = new Map<string, number>();
    const positionIndexes = new Map<string, number>();
    locatedApartments.forEach(({ position }) => {
      const key = this.positionKey(position);
      positionCounts.set(key, (positionCounts.get(key) || 0) + 1);
    });

    for (const { apartment, position } of locatedApartments) {
      const key = this.positionKey(position);
      const markerIndex = positionIndexes.get(key) || 0;
      const markerCount = positionCounts.get(key) || 1;
      positionIndexes.set(key, markerIndex + 1);
      const offsetX = (markerIndex - (markerCount - 1) / 2) * 66;
      const { wrapper, button, tail } = this.createPricePin(apartment, offsetX);
      const marker = new this.advancedMarkerConstructor({
        map: this.map,
        position,
        content: wrapper,
        zIndex: apartment.id === this.selectedApartmentId ? 100 : 1,
      });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.zone.run(() => {
          this.emitPreviewAnchor(apartment, button, true);
        });
      });
      const showHoverState = () => this.setMarkerHoverState(apartment.id, true);
      const hideHoverState = () => this.setMarkerHoverState(apartment.id, false);
      button.addEventListener('pointerenter', showHoverState);
      button.addEventListener('pointerleave', hideHoverState);
      button.addEventListener('focus', showHoverState);
      button.addEventListener('blur', hideHoverState);
      this.markers.push({ apartment, marker, wrapper, button, tail });
    }

    this.mappedApartmentCount = this.markers.length;
    this.updateSelectedMarker();
    if (fitBounds) this.fitVisibleProperties();
    this.refreshView();
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
    this.geocodeCache.set(cacheKey, streetPosition);
    return streetPosition;
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

  private updateSelectedMarker(): void {
    for (const item of this.markers) {
      const selected = item.apartment.id === this.selectedApartmentId;
      item.button.style.background = selected ? '#451a8f' : '#fff';
      item.button.style.color = selected ? '#fff' : '#171421';
      item.button.style.transform = selected ? 'translateY(-9px) scale(1.1)' : 'translateY(-9px)';
      item.button.style.boxShadow = selected
        ? '0 9px 22px rgba(69, 26, 143, .32)'
        : '0 5px 14px rgba(25, 16, 31, .22)';
      item.tail.style.background = selected ? '#451a8f' : '#fff';
      item.marker.zIndex = selected ? 100 : 1;
    }
  }

  private setMarkerHoverState(apartmentId: number, hovered: boolean): void {
    const item = this.markers.find((marker) => marker.apartment.id === apartmentId);
    if (!item) return;

    const selected = apartmentId === this.selectedApartmentId;
    item.button.style.background = selected ? '#451a8f' : '#fff';
    item.button.style.color = selected ? '#fff' : '#171421';
    item.button.style.transform = hovered
      ? `translateY(-15px) scale(${selected ? '1.1' : '1.04'})`
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
    const selected = this.markers.find(
      (item) => item.apartment.id === this.selectedApartmentId,
    );
    if (selected) requestAnimationFrame(() => this.emitPreviewAnchor(selected.apartment, selected.button));
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
    if (!this.map || !this.markers.length) return;
    const bounds = new google.maps.LatLngBounds();
    this.markers.forEach((item) => {
      const position = item.marker.position;
      if (position) bounds.extend(position);
    });
    if (this.markers.length === 1) {
      this.map.setCenter(bounds.getCenter());
      this.map.setZoom(15);
      return;
    }
    this.map.fitBounds(bounds, 70);
    google.maps.event.addListenerOnce(this.map, 'idle', () => {
      const zoom = this.map?.getZoom() || 0;
      if (zoom > 16) this.map?.setZoom(16);
      if (zoom < 7) this.map?.setZoom(7);
    });
  }

  private emitVisibleApartments(): void {
    const bounds = this.map?.getBounds();
    // Do not replace the loaded results with an empty list during the map's
    // first idle event, before async geocoding has produced its markers.
    if (!bounds || !this.markers.length) return;
    const visible = this.markers
      .filter((item) => {
        const position = item.marker.position;
        if (!position) return false;
        const point =
          position instanceof google.maps.LatLng
            ? position
            : new google.maps.LatLng(position.lat, position.lng);
        return bounds.contains(point);
      })
      .map((item) => item.apartment);
    this.mappedApartmentCount = visible.length;
    this.visibleApartmentsChanged.emit(visible);
    this.refreshView();
  }

  private clearMarkers(): void {
    this.markers.forEach((item) => (item.marker.map = null));
    this.markers = [];
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
