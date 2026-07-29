import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { GeoJsonPolygon } from '../../services/apartment.service';

@Component({
  selector: 'app-draw-area-map',
  standalone: false,
  templateUrl: './draw-area-map.component.html',
  styleUrl: './draw-area-map.component.css',
})
export class DrawAreaMapComponent implements AfterViewInit, OnDestroy {
  @Input() visible = false;
  @HostBinding('class.is-hidden') get isHidden(): boolean { return !this.visible; }
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;
  @Output() close = new EventEmitter<void>();
  @Output() apply = new EventEmitter<GeoJsonPolygon>();

  loading = true;
  errorMessage = '';
  hasPolygon = false;
  private map?: google.maps.Map;
  private draw?: import('terra-draw').TerraDraw;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    void this.initializeMap();
  }

  ngOnDestroy(): void {
    this.draw?.stop();
  }

  clearArea(): void {
    this.draw?.clear();
    this.hasPolygon = false;
    this.draw?.setMode('polygon');
  }

  applyArea(): void {
    const polygon = this.currentPolygon();
    if (polygon) this.apply.emit(polygon);
  }

  handleBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }

  private async initializeMap(): Promise<void> {
    const apiKey = document
      .querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')
      ?.content.trim();

    if (!apiKey || !this.mapContainer) {
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
      this.map = new Map(this.mapContainer.nativeElement, {
        center: { lat: 41.7151, lng: 44.8271 },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });

      this.draw = new TerraDraw({
        adapter: new TerraDrawGoogleMapsAdapter({ lib: google.maps, map: this.map }),
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: '#2563eb',
              fillOpacity: 0.18,
              outlineColor: '#2563eb',
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
        const polygons = this.draw?.getSnapshot().filter((feature) => feature.geometry.type === 'Polygon') || [];
        if (polygons.length > 1) this.draw?.removeFeatures(polygons.slice(0, -1).map((feature) => feature.id));
        const latest = this.draw?.getSnapshot().find((feature) => feature.geometry.type === 'Polygon');
        this.hasPolygon = !!latest;
        if (latest) this.draw?.selectFeature(latest.id);
        this.cdr.detectChanges();
      });
      this.draw.on('change', () => {
        this.hasPolygon = !!this.currentPolygon();
        this.cdr.detectChanges();
      });
      this.loading = false;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Draw Area map error:', error);
      this.errorMessage = 'The map could not be loaded. Please try again.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private currentPolygon(): GeoJsonPolygon | null {
    const feature = this.draw?.getSnapshot().find((item) => item.geometry.type === 'Polygon');
    return feature?.geometry.type === 'Polygon' ? (feature.geometry as GeoJsonPolygon) : null;
  }
}
