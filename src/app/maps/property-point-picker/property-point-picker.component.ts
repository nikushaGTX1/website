import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

@Component({
  selector: 'app-property-point-picker',
  standalone: false,
  templateUrl: './property-point-picker.component.html',
  styleUrl: './property-point-picker.component.css',
})
export class PropertyPointPickerComponent implements AfterViewInit, OnChanges {
  @Input() address = '';
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Output() latitudeChange = new EventEmitter<number | null>();
  @Output() longitudeChange = new EventEmitter<number | null>();
  @ViewChild('map') mapElement?: ElementRef<HTMLDivElement>;
  private map?: google.maps.Map;
  private marker?: google.maps.Marker;
  private geocoder?: google.maps.Geocoder;
  private geocodeRevision = 0;
  loading = true;
  errorMessage = '';
  pointConfirmed = false;

  ngAfterViewInit(): void { void this.initialize(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['address'] && this.map) void this.showAddress();
    if ((changes['latitude'] || changes['longitude']) && this.map && this.hasPoint) {
      this.pointConfirmed = true;
      this.setPoint(this.latitude!, this.longitude!, false);
    }
  }

  get hasPoint(): boolean {
    return Number.isFinite(this.latitude) && Number.isFinite(this.longitude);
  }

  clear(): void {
    this.marker?.setMap(null);
    this.marker = undefined;
    this.latitude = null;
    this.longitude = null;
    this.latitudeChange.emit(null);
    this.longitudeChange.emit(null);
  }

  private async initialize(): Promise<void> {
    const apiKey = document.querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')?.content?.trim();
    const mapId = document.querySelector<HTMLMetaElement>('meta[name="google-maps-map-id"]')?.content?.trim();
    if (!apiKey || !this.mapElement) {
      this.errorMessage = 'Google Maps is not configured.';
      this.loading = false;
      return;
    }
    try {
      setOptions({ key: apiKey, v: 'weekly', ...(mapId ? { mapIds: [mapId] } : {}) });
      const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
      const { Geocoder } = await importLibrary('geocoding') as google.maps.GeocodingLibrary;
      this.geocoder = new Geocoder();
      this.map = new Map(this.mapElement.nativeElement, {
        center: this.hasPoint
          ? { lat: this.latitude!, lng: this.longitude! }
          : { lat: 41.7151, lng: 44.7833 },
        zoom: this.hasPoint ? 18 : 12,
        ...(mapId ? { mapId } : {}),
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      this.map.addListener('click', (event: google.maps.MapMouseEvent) => {
        const point = event.latLng;
        if (point) {
          this.pointConfirmed = true;
          this.setPoint(point.lat(), point.lng(), true);
        }
      });
      if (this.address.trim()) await this.showAddress();
      else if (this.hasPoint) this.setPoint(this.latitude!, this.longitude!, false);
    } catch {
      this.errorMessage = 'The property point map could not be loaded.';
    } finally {
      this.loading = false;
    }
  }

  private async showAddress(): Promise<void> {
    if (!this.map || !this.geocoder) return;
    const address = this.address.trim();
    const revision = ++this.geocodeRevision;
    if (!address || address === 'Tbilisi') {
      this.marker?.setMap(null);
      this.marker = undefined;
      this.map.setCenter({ lat: 41.7151, lng: 44.7833 });
      this.map.setZoom(12);
      return;
    }
    try {
      const result = await this.geocoder.geocode({ address });
      if (revision !== this.geocodeRevision) return;
      const match = result.results[0];
      if (!match) return;
      const point = match.geometry.location;
      this.setPoint(point.lat(), point.lng(), false);
      if (match.geometry.viewport) this.map.fitBounds(match.geometry.viewport);
      this.map.setZoom(Math.min(this.map.getZoom() || 15, 16));
      this.errorMessage = '';
    } catch {
      if (revision === this.geocodeRevision) this.errorMessage = 'This location could not be previewed on the map.';
    }
  }

  private setPoint(latitude: number, longitude: number, emit: boolean): void {
    if (!this.map) return;
    const point = { lat: latitude, lng: longitude };
    if (!this.marker) {
      this.marker = new google.maps.Marker({
        map: this.map,
        position: point,
        draggable: false,
        title: 'Property location',
      });
    } else {
      this.marker.setPosition(point);
    }
    this.latitude = latitude;
    this.longitude = longitude;
    if (emit) {
      this.latitudeChange.emit(latitude);
      this.longitudeChange.emit(longitude);
    }
  }
}
