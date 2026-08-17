import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

@Component({
  selector: 'app-property-point-picker',
  standalone: false,
  templateUrl: './property-point-picker.component.html',
  styleUrl: './property-point-picker.component.css',
})
export class PropertyPointPickerComponent implements AfterViewInit, OnChanges {
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Output() latitudeChange = new EventEmitter<number | null>();
  @Output() longitudeChange = new EventEmitter<number | null>();
  @ViewChild('map') mapElement?: ElementRef<HTMLDivElement>;
  private map?: google.maps.Map;
  private marker?: google.maps.Marker;
  loading = true;
  errorMessage = '';

  ngAfterViewInit(): void { void this.initialize(); }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['latitude'] || changes['longitude']) && this.map && this.hasPoint) {
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
        if (event.latLng) this.setPoint(event.latLng.lat(), event.latLng.lng(), true);
      });
      if (this.hasPoint) this.setPoint(this.latitude!, this.longitude!, false);
    } catch {
      this.errorMessage = 'The property point map could not be loaded.';
    } finally {
      this.loading = false;
    }
  }

  private setPoint(latitude: number, longitude: number, emit: boolean): void {
    if (!this.map) return;
    const point = { lat: latitude, lng: longitude };
    if (!this.marker) {
      this.marker = new google.maps.Marker({
        map: this.map,
        position: point,
        draggable: true,
        title: 'Exact property location',
      });
      this.marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) this.setPoint(event.latLng.lat(), event.latLng.lng(), true);
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
