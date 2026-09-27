import { importLibrary } from '@googlemaps/js-api-loader';

interface EvCharger {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const MIN_ZOOM = 12;
const MAX_MARKERS = 250;
const SEARCH_DEBOUNCE_MS = 600;

/** Chargers found per search tile, shared by every map on the page. */
const tileCache = new Map<string, Promise<EvCharger[]>>();

const CHARGER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
  '<circle cx="15" cy="15" r="13" fill="#12925f" stroke="#ffffff" stroke-width="2.5"/>' +
  '<path d="M16.6 6.5 9.8 16.4h4.6l-1.1 7.1 6.9-10h-4.7z" fill="#ffffff"/>' +
  '</svg>';
const CHARGER_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CHARGER_ICON_SVG)}`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Shows electric-vehicle charging stations on a Google map. Chargers are
 * loaded for the visible area once the map is zoomed in far enough, cached
 * per area, and can be hidden with the on-map toggle.
 *
 * Call `destroy()` when the map's component is destroyed.
 */
export class EvChargerLayer {
  private readonly markers = new Map<string, google.maps.Marker>();
  private readonly listeners: google.maps.MapsEventListener[] = [];
  private infoWindow?: google.maps.InfoWindow;
  private toggleButton?: HTMLButtonElement;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private visible = true;
  private destroyed = false;

  constructor(private readonly map: google.maps.Map) {
    this.addToggleControl();
    this.listeners.push(map.addListener('idle', () => this.scheduleLoad()));
    this.scheduleLoad();
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.debounceTimer);
    this.listeners.forEach((listener) => listener.remove());
    this.markers.forEach((marker) => marker.setMap(null));
    this.markers.clear();
    this.infoWindow?.close();
  }

  private addToggleControl(): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ev-charger-toggle';
    button.setAttribute('aria-pressed', 'true');
    button.title = 'Show or hide EV chargers';
    Object.assign(button.style, {
      margin: '10px',
      padding: '0 12px',
      height: '34px',
      minHeight: '34px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      border: '0',
      borderRadius: '999px',
      background: '#ffffff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      color: '#0f8f61',
      font: '700 12px Arial, Helvetica, sans-serif',
      cursor: 'pointer',
    } as Partial<CSSStyleDeclaration>);
    button.innerHTML = '<span aria-hidden="true" style="font-size:14px">⚡</span><span>EV chargers</span>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setVisible(!this.visible);
    });
    this.toggleButton = button;
    this.map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(button);
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.toggleButton) {
      this.toggleButton.setAttribute('aria-pressed', String(visible));
      this.toggleButton.style.color = visible ? '#0f8f61' : '#8a8f9c';
      this.toggleButton.style.opacity = visible ? '1' : '0.85';
    }
    this.markers.forEach((marker) => marker.setMap(visible ? this.map : null));
    if (!visible) this.infoWindow?.close();
    else this.scheduleLoad();
  }

  private scheduleLoad(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.loadVisibleArea(), SEARCH_DEBOUNCE_MS);
  }

  private async loadVisibleArea(): Promise<void> {
    if (this.destroyed || !this.visible) return;
    const zoom = this.map.getZoom() ?? 0;
    const bounds = this.map.getBounds();
    const center = this.map.getCenter();
    if (!bounds || !center || zoom < MIN_ZOOM) return;

    const northEast = bounds.getNorthEast();
    const radius = Math.min(
      50000,
      Math.max(800, google.maps.geometry?.spherical
        ? google.maps.geometry.spherical.computeDistanceBetween(center, northEast)
        : this.haversineMeters(center.lat(), center.lng(), northEast.lat(), northEast.lng())),
    );

    // Snap searches to a grid so small pans reuse the same cached request.
    const step = zoom >= 15 ? 0.01 : zoom >= 13 ? 0.02 : 0.05;
    const lat = Math.round(center.lat() / step) * step;
    const lng = Math.round(center.lng() / step) * step;
    const radiusBucket = Math.ceil(radius / 1000) * 1000;
    const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radiusBucket}`;

    let request = tileCache.get(key);
    if (!request) {
      request = this.searchChargers(lat, lng, radiusBucket);
      tileCache.set(key, request);
      request.catch(() => tileCache.delete(key));
    }

    try {
      const chargers = await request;
      if (!this.destroyed && this.visible) this.addMarkers(chargers);
    } catch {
      // Places errors (quota, key restrictions) should never break the map.
    }
  }

  private async searchChargers(lat: number, lng: number, radius: number): Promise<EvCharger[]> {
    const { Place, SearchNearbyRankPreference } = (await importLibrary('places')) as google.maps.PlacesLibrary;
    const response = await Place.searchNearby({
      fields: ['id', 'displayName', 'formattedAddress', 'location'],
      locationRestriction: { center: { lat, lng }, radius },
      includedPrimaryTypes: ['electric_vehicle_charging_station'],
      maxResultCount: 20,
      // Wide views: spread results over the area instead of clumping at the center.
      rankPreference: radius > 3000 ? SearchNearbyRankPreference.POPULARITY : SearchNearbyRankPreference.DISTANCE,
    });
    return response.places
      .filter((place) => !!place.location)
      .map((place) => ({
        id: place.id,
        name: place.displayName || 'EV charging station',
        address: place.formattedAddress || '',
        lat: place.location!.lat(),
        lng: place.location!.lng(),
      }));
  }

  private addMarkers(chargers: EvCharger[]): void {
    for (const charger of chargers) {
      if (this.markers.has(charger.id) || this.markers.size >= MAX_MARKERS) continue;
      const marker = new google.maps.Marker({
        map: this.map,
        position: { lat: charger.lat, lng: charger.lng },
        title: charger.name,
        zIndex: 5,
        icon: {
          url: CHARGER_ICON_URL,
          scaledSize: new google.maps.Size(26, 26),
          anchor: new google.maps.Point(13, 13),
        },
      });
      marker.addListener('click', () => this.openInfo(marker, charger));
      this.markers.set(charger.id, marker);
    }
  }

  private openInfo(marker: google.maps.Marker, charger: EvCharger): void {
    this.infoWindow ??= new google.maps.InfoWindow();
    this.infoWindow.setContent(
      `<div style="font:13px Arial,Helvetica,sans-serif;max-width:220px">` +
        `<div style="display:flex;gap:6px;align-items:center;color:#0f8f61;font-weight:800;font-size:11px;text-transform:uppercase">⚡ EV charger</div>` +
        `<div style="margin-top:4px;font-weight:700;color:#1d1726">${escapeHtml(charger.name)}</div>` +
        (charger.address ? `<div style="margin-top:3px;color:#6b7080">${escapeHtml(charger.address)}</div>` : '') +
        `</div>`,
    );
    this.infoWindow.open({ map: this.map, anchor: marker });
  }

  private haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
