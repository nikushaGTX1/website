import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild } from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

/** Tbilisi centre, used until the client marks their office. */
const TBILISI = { lat: 41.7151, lng: 44.8271 };

/**
 * Velven Match, "Business professional" → "Close to my office": the client taps the map to mark
 * their office. Homes are then ranked by distance to that point.
 */
@Component({
  selector: 'app-office-map-picker',
  standalone: true,
  template: `
    <div class="omp">
      <form class="omp-search" (submit)="$event.preventDefault(); search()">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input #searchEl type="search" autocomplete="off" placeholder="Type your office address" aria-label="Office address" />
        <button type="submit" [disabled]="searching">Find</button>
      </form>
      @if (notFound) {
        <p class="omp-note error">We could not find that address. Try another or tap the map.</p>
      }
      <div #mapEl class="omp-map" role="application" aria-label="Map: tap to mark your office"></div>
      @if (failed) {
        <p class="omp-note error">The map could not be loaded. Please try again later.</p>
      } @else if (latitude == null) {
        <p class="omp-note"><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i><span>Tap the map where your office is.</span></p>
      } @else {
        <p class="omp-note done"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Office marked. Tap again to move it.</span></p>
      }
    </div>
  `,
  styles: [`
    .omp { display: grid; gap: 10px; }
    .omp-search { position: relative; display: flex; align-items: center; gap: 8px; }
    .omp-search > i { position: absolute; left: 15px; color: #8a829c; pointer-events: none; }
    .omp-search input { flex: 1; min-width: 0; height: 48px; padding: 0 14px 0 40px; border: 1.5px solid #e6def6; border-radius: 14px; font: inherit; font-size: 15px; outline: none; background: #fff; }
    .omp-search input:focus { border-color: #6d2ee0; box-shadow: 0 0 0 3px rgba(109, 46, 224, 0.12); }
    .omp-search button { flex: none; height: 48px; padding: 0 20px; border: 0; border-radius: 14px; background: #4c1d95; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .omp-search button:disabled { opacity: 0.6; }
    .omp-map { width: 100%; height: 300px; overflow: hidden; border: 1px solid #e6def6; border-radius: 16px; background: #f1ecfb; }
    .omp-note { display: flex; align-items: center; gap: 8px; margin: 0; color: #5d566b; font-size: 14px; }
    .omp-note i { color: #6d2ee0; }
    .omp-note.done { color: #15803d; font-weight: 600; }
    .omp-note.done i { color: #16a34a; }
    .omp-note.error { color: #b91c1c; }
    @media (max-width: 560px) { .omp-map { height: 240px; } }
  `],
})
export class OfficeMapPickerComponent implements AfterViewInit, OnDestroy {
  @Input() latitude?: number;
  @Input() longitude?: number;
  @Output() picked = new EventEmitter<{ latitude: number; longitude: number }>();
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  @ViewChild('searchEl') searchEl!: ElementRef<HTMLInputElement>;

  failed = false;
  searching = false;
  notFound = false;
  private map?: google.maps.Map;
  private geocoder?: google.maps.Geocoder;
  private marker?: google.maps.Marker;
  private listener?: google.maps.MapsEventListener;

  constructor(private zone: NgZone) {}

  async ngAfterViewInit(): Promise<void> {
    const apiKey = document.querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')?.content.trim();
    if (!apiKey) { this.failed = true; return; }
    try {
      setOptions({ key: apiKey, v: 'weekly' });
      const { Map } = (await importLibrary('maps')) as google.maps.MapsLibrary;
      await importLibrary('marker');
      const start = this.latitude != null && this.longitude != null ? { lat: this.latitude, lng: this.longitude } : TBILISI;
      const map = new Map(this.mapEl.nativeElement, {
        center: start, zoom: this.latitude != null ? 15 : 12,
        disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false,
      });
      this.map = map;
      if (this.latitude != null && this.longitude != null) this.place(map, start);
      // Typing an address: suggestions (Places) plus a geocoder fallback for "Find" / Enter.
      try {
        const { Autocomplete } = (await importLibrary('places')) as google.maps.PlacesLibrary;
        const auto = new Autocomplete(this.searchEl.nativeElement, {
          fields: ['geometry', 'formatted_address'], componentRestrictions: { country: 'ge' },
          bounds: { north: 41.85, south: 41.6, east: 45.0, west: 44.65 },
        });
        auto.addListener('place_changed', () => {
          const location = auto.getPlace().geometry?.location;
          if (location) this.zone.run(() => this.choose({ lat: location.lat(), lng: location.lng() }));
        });
      } catch { /* Places not available: Find still works through the geocoder. */ }
      this.listener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) return;
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        this.place(map, point);
        this.zone.run(() => {
          this.latitude = point.lat;
          this.longitude = point.lng;
          this.picked.emit({ latitude: point.lat, longitude: point.lng });
        });
      });
    } catch {
      this.zone.run(() => (this.failed = true));
    }
  }

  async search(): Promise<void> {
    const query = this.searchEl.nativeElement.value.trim();
    if (!query || !this.map) return;
    this.searching = true;
    this.notFound = false;
    try {
      const { Geocoder } = (await importLibrary('geocoding')) as google.maps.GeocodingLibrary;
      this.geocoder ??= new Geocoder();
      const { results } = await this.geocoder.geocode({ address: query, region: 'ge', bounds: { north: 41.85, south: 41.6, east: 45.0, west: 44.65 } });
      const location = results[0]?.geometry.location;
      this.zone.run(() => (location ? this.choose({ lat: location.lat(), lng: location.lng() }) : (this.notFound = true)));
    } catch {
      this.zone.run(() => (this.notFound = true));
    } finally {
      this.zone.run(() => (this.searching = false));
    }
  }

  private choose(point: google.maps.LatLngLiteral): void {
    if (!this.map) return;
    this.notFound = false;
    this.place(this.map, point);
    this.map.panTo(point);
    this.map.setZoom(16);
    this.latitude = point.lat;
    this.longitude = point.lng;
    this.picked.emit({ latitude: point.lat, longitude: point.lng });
  }

  private place(map: google.maps.Map, point: google.maps.LatLngLiteral): void {
    if (this.marker) { this.marker.setPosition(point); return; }
    this.marker = new google.maps.Marker({ map, position: point, title: 'Your office' });
  }

  ngOnDestroy(): void {
    this.listener?.remove();
    this.marker?.setMap(null);
  }
}
