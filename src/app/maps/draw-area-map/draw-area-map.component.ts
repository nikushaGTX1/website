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
import { ApiLocation } from '../../models/location';
import { LocationService } from '../../services/location.service';

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
    const coordinates = this.areaPolygons[area];
    if (!coordinates || !this.draw || !this.map) return;
    this.draw.clear();
    const featureId = this.draw.getFeatureId();
    const feature = {
      type: 'Feature' as const,
      id: featureId,
      properties: { mode: 'polygon', name: area },
      geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
    };
    const result = this.draw.addFeatures([feature]);
    if (result[0]?.valid) {
      this.selectedArea = area;
      this.selectedStreet = '';
      this.streetSearch = '';
      this.streetStep = true;
      this.hasPolygon = true;
      this.draw.selectFeature(featureId);
      const bounds = new google.maps.LatLngBounds();
      coordinates.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
      this.map.fitBounds(bounds, 48);
      this.cdr.detectChanges();
    } else {
      console.error(`Could not draw ${area}:`, result[0]?.reason || 'Invalid polygon');
    }
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
              fillColor: '#5A31E6',
              fillOpacity: 0.18,
              outlineColor: '#5A31E6',
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
        this.cdr.detectChanges();
      });
      this.draw.on('change', () => {
        this.hasPolygon = !!this.currentPolygon();
        if (!this.hasPolygon) this.selectedArea = '';
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
