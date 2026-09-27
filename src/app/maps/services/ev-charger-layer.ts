import { importLibrary } from '@googlemaps/js-api-loader';

interface MapPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  ratingCount?: number;
  mapsUrl?: string;
}

interface PlaceLayerConfig {
  /** Google Places primary type to search for. */
  placeType: string;
  /** Default name when Google has none. */
  fallbackName: string;
  /** Label on the on-map toggle and in the info card. */
  label: string;
  toggleTitle: string;
  toggleEmoji: string;
  color: string;
  /** Inner SVG drawn in white on the colored circle (30×30 viewBox). */
  glyph: string;
}

const MIN_ZOOM = 12;
const MAX_MARKERS = 250;
const SEARCH_DEBOUNCE_MS = 600;

const PARK_CONFIG: PlaceLayerConfig = {
  placeType: 'park',
  fallbackName: 'Park',
  label: 'Park',
  toggleTitle: 'Show or hide parks',
  toggleEmoji: '🌳',
  color: '#12925f',
  glyph:
    '<path d="M15 6.2 9.6 13h2.9l-3.6 4.6h4.9V22h2.4v-4.4h4.9L17.5 13h2.9z" fill="#ffffff"/>',
};

/** Places found per search tile and type, shared by every map on the page. */
const tileCache = new Map<string, Promise<MapPlace[]>>();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function cleanPlaceAddress(value: string): string {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/i.test(parts[0])) {
    parts.shift();
  }
  return parts
    .filter((part, index, all) => all.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index)
    .map((part) => (/^t['’]?bilisi$/i.test(part) ? 'Tbilisi' : part))
    .join(', ');
}

function iconUrl(config: PlaceLayerConfig): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
    `<circle cx="15" cy="15" r="13" fill="${config.color}" stroke="#ffffff" stroke-width="2.5"/>` +
    config.glyph +
    '</svg>';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Shows one kind of Google place (EV chargers, parks, …) on a map. Places are
 * loaded for the visible area once the map is zoomed in far enough, cached per
 * area, and can be hidden with an on-map toggle. Clicking a marker opens a card
 * with the place's photo, rating and address.
 */
class PlaceMarkerLayer {
  private readonly markers = new Map<string, google.maps.Marker>();
  private readonly listeners: google.maps.MapsEventListener[] = [];
  private readonly icon: string;
  private toggleButton?: HTMLButtonElement;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private visible = true;
  private destroyed = false;

  constructor(
    private readonly map: google.maps.Map,
    private readonly config: PlaceLayerConfig,
    private readonly infoWindow: google.maps.InfoWindow,
    toggleContainer: HTMLElement,
  ) {
    this.icon = iconUrl(config);
    this.addToggle(toggleContainer);
    this.listeners.push(map.addListener('idle', () => this.scheduleLoad()));
    this.scheduleLoad();
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.debounceTimer);
    this.listeners.forEach((listener) => listener.remove());
    this.markers.forEach((marker) => marker.setMap(null));
    this.markers.clear();
  }

  private addToggle(container: HTMLElement): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-place-toggle';
    button.setAttribute('aria-pressed', 'true');
    button.title = this.config.toggleTitle;
    Object.assign(button.style, {
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
      color: this.config.color,
      font: '700 12px Arial, Helvetica, sans-serif',
      cursor: 'pointer',
    } as Partial<CSSStyleDeclaration>);
    const emoji = document.createElement('span');
    emoji.setAttribute('aria-hidden', 'true');
    emoji.style.fontSize = '14px';
    emoji.textContent = this.config.toggleEmoji;
    const text = document.createElement('span');
    text.textContent = `${this.config.label === 'Park' ? 'Parks' : 'EV chargers'}`;
    button.append(emoji, text);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setVisible(!this.visible);
    });
    this.toggleButton = button;
    container.appendChild(button);
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.toggleButton) {
      this.toggleButton.setAttribute('aria-pressed', String(visible));
      this.toggleButton.style.color = visible ? this.config.color : '#8a8f9c';
      this.toggleButton.style.textDecoration = visible ? 'none' : 'line-through';
    }
    this.markers.forEach((marker) => marker.setMap(visible ? this.map : null));
    if (!visible) this.infoWindow.close();
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
      Math.max(800, haversineMeters(center.lat(), center.lng(), northEast.lat(), northEast.lng())),
    );

    // Snap searches to a grid so small pans reuse the same cached request.
    const step = zoom >= 15 ? 0.01 : zoom >= 13 ? 0.02 : 0.05;
    const lat = Math.round(center.lat() / step) * step;
    const lng = Math.round(center.lng() / step) * step;
    const radiusBucket = Math.ceil(radius / 1000) * 1000;
    const key = `${this.config.placeType}:${lat.toFixed(3)},${lng.toFixed(3)},${radiusBucket}`;

    let request = tileCache.get(key);
    if (!request) {
      request = this.search(lat, lng, radiusBucket);
      tileCache.set(key, request);
      request.catch(() => tileCache.delete(key));
    }

    try {
      const places = await request;
      if (!this.destroyed && this.visible) this.addMarkers(places);
    } catch {
      // Places errors (quota, key restrictions) should never break the map.
    }
  }

  private async search(lat: number, lng: number, radius: number): Promise<MapPlace[]> {
    const { Place, SearchNearbyRankPreference } = (await importLibrary('places')) as google.maps.PlacesLibrary;
    const response = await Place.searchNearby({
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'googleMapsURI'],
      locationRestriction: { center: { lat, lng }, radius },
      includedPrimaryTypes: [this.config.placeType],
      maxResultCount: 20,
      // Wide views: spread results over the area instead of clumping at the center.
      rankPreference: radius > 3000 ? SearchNearbyRankPreference.POPULARITY : SearchNearbyRankPreference.DISTANCE,
    });
    return response.places
      .filter((place) => !!place.location)
      .map((place) => ({
        id: place.id,
        name: place.displayName || this.config.fallbackName,
        address: cleanPlaceAddress(place.formattedAddress || ''),
        lat: place.location!.lat(),
        lng: place.location!.lng(),
        rating: place.rating ?? undefined,
        ratingCount: place.userRatingCount ?? undefined,
        mapsUrl: place.googleMapsURI ?? undefined,
      }));
  }

  private addMarkers(places: MapPlace[]): void {
    for (const place of places) {
      if (this.markers.has(place.id) || this.markers.size >= MAX_MARKERS) continue;
      const marker = new google.maps.Marker({
        map: this.map,
        position: { lat: place.lat, lng: place.lng },
        title: place.name,
        zIndex: 5,
        icon: {
          url: this.icon,
          scaledSize: new google.maps.Size(26, 26),
          anchor: new google.maps.Point(13, 13),
        },
      });
      marker.addListener('click', () => void this.openInfo(marker, place));
      this.markers.set(place.id, marker);
    }
  }

  private async openInfo(marker: google.maps.Marker, place: MapPlace): Promise<void> {
    this.infoWindow.setContent(this.infoHtml(place));
    this.infoWindow.open({ map: this.map, anchor: marker });

    // The photo is fetched only when someone opens the card.
    try {
      const { Place } = (await importLibrary('places')) as google.maps.PlacesLibrary;
      const details = new Place({ id: place.id });
      await details.fetchFields({ fields: ['photos'] });
      const photo = details.photos?.[0]?.getURI({ maxWidth: 480, maxHeight: 260 });
      if (photo && this.infoWindow.get('anchor') === marker) {
        this.infoWindow.setContent(this.infoHtml(place, photo));
      }
    } catch {
      // The card is still useful without a photo.
    }
  }

  private infoHtml(place: MapPlace, photoUrl?: string): string {
    const stars =
      place.rating !== undefined
        ? `<div style="margin-top:7px;display:flex;gap:5px;align-items:center;color:#3b3347;font-weight:700">` +
          `<span style="color:#f5a524">★</span>${place.rating.toFixed(1)}` +
          (place.ratingCount ? `<span style="color:#8a8f9c;font-weight:400">(${place.ratingCount})</span>` : '') +
          `</div>`
        : '';
    return (
      `<div style="font:13px Arial,Helvetica,sans-serif;width:248px;max-width:100%;padding:2px 0 1px">` +
      (photoUrl
        ? `<div style="width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:12px;background:#eef1ed;margin-bottom:11px">` +
          `<img src="${escapeHtml(photoUrl)}" alt="" style="display:block;width:100%;height:100%;object-fit:cover;object-position:center;transform:scale(1.01)"></div>`
        : '') +
      `<div style="display:inline-flex;align-items:center;gap:5px;color:${this.config.color};font-weight:800;font-size:11px;text-transform:uppercase">` +
      `${this.config.toggleEmoji} ${escapeHtml(this.config.label)}</div>` +
      `<div style="margin-top:5px;font-weight:800;font-size:16px;line-height:1.3;color:#1d1726">${escapeHtml(place.name)}</div>` +
      stars +
      (place.address ? `<div style="margin-top:7px;color:#6b7080;line-height:1.45">${escapeHtml(cleanPlaceAddress(place.address))}</div>` : '') +
      (place.mapsUrl
        ? `<a href="${escapeHtml(place.mapsUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;margin-top:11px;padding:8px 11px;border-radius:9px;background:#f4effa;color:#451a8f;font-weight:800;text-decoration:none">Open in Google Maps&nbsp; ↗</a>`
        : '') +
      `</div>`
    );
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Nearby parks on a Google map with an on-map show/hide toggle.
 * Call `destroy()` when the map's component is destroyed.
 */
export class EvChargerLayer {
  private readonly layers: PlaceMarkerLayer[];
  private readonly infoWindow = new google.maps.InfoWindow();

  constructor(map: google.maps.Map) {
    const toggles = document.createElement('div');
    Object.assign(toggles.style, { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '10px' });
    map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(toggles);
    this.layers = [
      new PlaceMarkerLayer(map, PARK_CONFIG, this.infoWindow, toggles),
    ];
  }

  destroy(): void {
    this.layers.forEach((layer) => layer.destroy());
    this.infoWindow.close();
  }
}
