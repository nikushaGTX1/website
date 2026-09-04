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
import { Apartment } from '../../models/apartment';
import { Router } from '@angular/router';

@Component({
  selector: 'app-draw-area-map',
  standalone: false,
  templateUrl: './draw-area-map.component.html',
  styleUrl: './draw-area-map.component.css',
})
export class DrawAreaMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private static readonly tbilisiMapBounds: google.maps.LatLngBoundsLiteral = {
    south: 41.55,
    west: 44.58,
    north: 41.9,
    east: 45.08,
  };
  private static readonly persistentMapCache = new PersistentDataCache(
    // v7 publishes the detailed SS.ge-derived Didi Dighomi real-estate
    // coverage and invalidates both the narrow OSM core and coarse v6 draft.
    'map-geometry-v7',
    180 * 24 * 60 * 60 * 1000,
  );
  private static readonly sharedBoundaryCache = new Map<string, number[][][][]>();
  private static readonly boundaryRequests = new Map<string, Promise<number[][][][]>>();
  @Input() visible = false;
  @Input() compact = false;
  @Input() selectedAreaInput = '';
  @Input() selectedAreasInput: string[] = [];
  @Input() selectedStreetsInput: Array<{ streetId: number; street: string; district: string }> = [];
  @Input() apartments: Apartment[] = [];
  @HostBinding('class.is-hidden') get isHidden(): boolean {
    return !this.visible;
  }
  @HostBinding('class.is-compact') get isCompact(): boolean {
    return this.compact;
  }
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('compactMapContainer') compactMapContainer?: ElementRef<HTMLDivElement>;
  @Output() close = new EventEmitter<void>();
  @Output() apply = new EventEmitter<GeoJsonPolygon>();
  @Output() polygonChange = new EventEmitter<GeoJsonPolygon | null>();
  @Output() drawnStreetsChange = new EventEmitter<
    Array<{ id: number; label: string; value: string; district: string }>
  >();
  @Output() detectedAreaChange = new EventEmitter<string>();
  @Output() streetSelected = new EventEmitter<{
    id: number;
    label: string;
    value: string;
    district: string;
    type: 'Street';
    city: string;
  }>();

  loading = true;
  errorMessage = '';
  hasPolygon = false;
  compactMapInteractive = false;
  drawingEnabled = false;
  areaSearch = '';
  streetSearch = '';
  selectedArea = '';
  selectedAreas: string[] = [];
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
  private streetLines: Array<google.maps.OverlayView | google.maps.Polyline> = [];
  private countOverlays: google.maps.OverlayView[] = [];
  private priceOverlays: google.maps.OverlayView[] = [];
  private propertyPreviewOverlay?: google.maps.OverlayView;
  private previewApartmentId: number | null = null;
  private activePreviewPin?: HTMLDivElement;
  private activePreviewTail?: HTMLElement;
  private streetFocusOverlay?: google.maps.OverlayView;
  private drawnDeleteOverlay?: google.maps.OverlayView;
  private selectedBoundaryPolygons: google.maps.Polygon[] = [];
  private selectedBoundaryLines: google.maps.Polyline[] = [];
  private isCustomDrawing = false;
  private activeStreetPaths: number[][][] = [];
  private activePriceAreas: string[] = [];
  private zoomListener?: google.maps.MapsEventListener;
  private selectionRevision = 0;
  private streetRevision = 0;
  private drawnAreaRevision = 0;
  private preserveDrawnPolygonOnInputChange = false;
  private usesCloudMapStyle = false;
  private readonly boundaryCache = DrawAreaMapComponent.sharedBoundaryCache;
  constructor(
    private cdr: ChangeDetectorRef,
    private locationService: LocationService,
    private router: Router,
  ) {}

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
    let areaSelectionChanged = false;
    if (changes['selectedAreasInput'] && this.draw && this.map && !preserveDrawnPolygon) {
      areaSelectionChanged = true;
      void this.chooseAreas(this.selectedAreasInput);
    } else if (
      changes['selectedAreaInput'] &&
      this.selectedAreaInput &&
      this.draw &&
      this.map &&
      !preserveDrawnPolygon
    ) {
      areaSelectionChanged = true;
      void this.chooseAreas([this.selectedAreaInput]);
    }
    // chooseAreas draws the district first and then awaits the street draw.
    // Starting both here caused the slower district request to clear the
    // street overlay and restore the district-level zoom.
    if (changes['selectedStreetsInput'] && this.map && !areaSelectionChanged) {
      void this.drawSelectedStreets();
    }
    if (changes['apartments'] && this.map && this.hasPolygon) {
      const polygon = this.currentPolygon();
      if (this.isCustomDrawing && polygon) this.renderApartmentPriceOverlays([], polygon);
      else this.refreshApartmentCountOverlays();
    }
  }

  ngOnDestroy(): void {
    this.draw?.stop();
    this.clearApartmentCountOverlays();
    this.clearApartmentPriceOverlays();
    this.clearPropertyPreview();
    this.zoomListener?.remove();
    this.clearStreetFocus();
    this.clearDrawDeleteControl();
    this.clearSelectedBoundaryOverlay();
  }

  private setLegacyMapStyles(styles: google.maps.MapTypeStyle[] | null): void {
    // A map ID receives its style from Google Cloud. Passing JSON styles as
    // well is unsupported and causes the Maps API warning seen in development.
    if (!this.usesCloudMapStyle) this.map?.setOptions({ styles });
  }

  /**
   * Draw approved location boundaries separately from Terra Draw so selected
   * districts can use a map-style dotted outline while manual drawings retain
   * their editable purple controls.
   */
  private renderSelectedBoundaryOverlay(
    areas: Array<{ area: string; polygons: number[][][][] }>,
  ): void {
    this.clearSelectedBoundaryOverlay();
    if (!this.map) return;

    const dottedLineSymbol: google.maps.Symbol = {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#d93025',
      fillOpacity: 1,
      strokeColor: '#d93025',
      strokeOpacity: 1,
      scale: 1.4,
    };

    areas.forEach(({ polygons }) =>
      polygons.forEach((rings) => {
        const paths = rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
        this.selectedBoundaryPolygons.push(
          new google.maps.Polygon({
            map: this.map,
            paths,
            clickable: false,
            fillColor: '#d93025',
            fillOpacity: 0.035,
            strokeOpacity: 0,
            zIndex: 20,
          }),
        );

        paths.forEach((path) =>
          this.selectedBoundaryLines.push(
            new google.maps.Polyline({
              map: this.map,
              path,
              clickable: false,
              strokeOpacity: 0,
              icons: [{ icon: dottedLineSymbol, offset: '0', repeat: '7px' }],
              zIndex: 21,
            }),
          ),
        );
      }),
    );
  }

  private clearSelectedBoundaryOverlay(): void {
    this.selectedBoundaryPolygons.forEach((polygon) => polygon.setMap(null));
    this.selectedBoundaryLines.forEach((line) => line.setMap(null));
    this.selectedBoundaryPolygons = [];
    this.selectedBoundaryLines = [];
  }

  clearArea(): void {
    this.drawnAreaRevision++;
    this.draw?.clear();
    this.hasPolygon = false;
    this.selectedArea = '';
    this.selectedAreas = [];
    this.selectedStreet = '';
    this.selectedStreetId = null;
    this.streetStep = false;
    this.isCustomDrawing = false;
    this.setDrawingEnabled(false);
    this.polygonChange.emit(null);
    this.drawnStreetsChange.emit([]);
    this.clearStreetLines();
    this.activeStreetPaths = [];
    this.clearStreetFocus();
    this.clearDrawDeleteControl();
    this.clearSelectedBoundaryOverlay();
    this.clearApartmentCountOverlays();
    this.clearApartmentPriceOverlays();
    this.setLegacyMapStyles(null);
  }

  enableCompactMap(): void {
    this.startDrawing();
  }

  applyCompactMapChanges(): void {
    const polygon = this.currentPolygon();
    if (!polygon) return;
    this.polygonChange.emit(polygon);
    this.setDrawingEnabled(false);
  }

  get filteredAreaGroups(): { title: string; areas: string[] }[] {
    const query = this.areaSearch.trim().toLowerCase();
    if (!query) return this.areaGroups;
    return this.areaGroups
      .map((group) => ({
        ...group,
        areas: group.areas.filter((area) => area.toLowerCase().includes(query)),
      }))
      .filter((group) => group.areas.length);
  }

  get selectedAreaStreets(): Array<{ id: number; label: string; value: string }> {
    const entry = this.locations.find(
      (location) => location.district.toLowerCase() === this.selectedArea.toLowerCase(),
    );
    const streets = entry ? this.locationService.streetNames(entry, 'en') : [];
    const query = this.streetSearch.trim().toLowerCase();
    return streets.filter(
      (street) =>
        !query ||
        street.label.toLowerCase().includes(query) ||
        street.value.toLowerCase().includes(query),
    );
  }

  get popularStreets(): Array<{ id: number; label: string; value: string }> {
    return this.selectedAreaStreets.slice(0, 6);
  }

  get manualStreetSuggestions(): Array<{
    id: number;
    label: string;
    value: string;
    district: string;
  }> {
    const query = this.normalizeStreetQuery(this.streetSearch);
    if (query.length < 2) return [];
    const language = this.locationService.languageForQuery(this.streetSearch);
    const selectedDistricts = new Set(
      this.selectedArea
        .split(',')
        .map((district) => district.trim().toLowerCase())
        .filter(Boolean),
    );
    // Search the complete official catalog. A district selection affects
    // ranking, not visibility, because many streets cross district borders
    // and the supplied catalog also contains smaller neighbourhood groups.
    const searchableLocations = [...this.locations].sort((left, right) => {
      const selected = (location: ApiLocation) =>
        selectedDistricts.has(location.district.trim().toLowerCase()) ||
        selectedDistricts.has(
          this.locationService.districtName(location, 'ka').trim().toLowerCase(),
        );
      return Number(selected(right)) - Number(selected(left));
    });

    return searchableLocations
      .flatMap((location) =>
        this.locationService.streetNames(location, language).map((street) => ({
          ...street,
          district: location.district,
        })),
      )
      .filter(
        (street) =>
          this.normalizeStreetQuery(street.label).includes(query) ||
          this.normalizeStreetQuery(street.value).includes(query) ||
          street.aliases.some((alias) => this.normalizeStreetQuery(alias).includes(query)),
      )
      .filter((street, index, list) => list.findIndex((item) => item.id === street.id) === index)
      .slice(0, 7);
  }

  private normalizeStreetQuery(value: string): string {
    return value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[.,'’`\-–—()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async selectManualStreet(
    street: {
      id: number;
      label: string;
      value: string;
      district: string;
    },
    event?: Event,
  ): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();

    const districtIsAlreadySelected = this.selectedAreas.some(
      (area) => area.trim().toLowerCase() === street.district.trim().toLowerCase(),
    );
    if (!districtIsAlreadySelected) await this.chooseAreas([street.district]);
    this.streetStep = false;
    // Commit the user's choice before requesting geometry. A missing or slow
    // geometry response must not make a successful street click disappear.
    this.selectedStreet = street.value || street.label;
    this.selectedStreetId = street.id;
    this.streetSearch = '';
    this.streetSelected.emit({ ...street, type: 'Street', city: 'Tbilisi' });
    this.cdr.detectChanges();
    await this.selectStreet(street);
  }

  async selectStreet(street: {
    id: number;
    label: string;
    value: string;
    district?: string;
  }): Promise<void> {
    this.errorMessage = '';
    this.activeStreetPaths = [];
    this.clearStreetFocus();
    this.selectedStreet = street.label || street.value;
    this.selectedStreetId = street.id;
    this.streetSearch = '';
    const revision = ++this.streetRevision;
    try {
      const record = await firstValueFrom(this.locationService.getStreet(street.id));
      if (revision !== this.streetRevision) return;
      if (!record.geometry) {
        const focused = await this.focusStreetByAddress(street);
        if (!focused) this.errorMessage = 'Exact street geometry is not available yet.';
        this.cdr.detectChanges();
        return;
      }
      const paths =
        record.geometry.type === 'LineString'
          ? [record.geometry.coordinates as number[][]]
          : (record.geometry.coordinates as number[][][]);
      this.clearStreetLines();
      this.activeStreetPaths = paths;
      this.renderStreetPaths(paths, true);
      this.renderStreetFocus(paths, street.label);
      this.renderApartmentPriceOverlays(this.activePriceAreas);
    } catch {
      if (revision !== this.streetRevision) return;
      // Keep the selected street visible/filterable even if its verified
      // geometry cannot currently be drawn.
      const focused = await this.focusStreetByAddress(street);
      this.errorMessage = focused ? '' : 'Exact street geometry is not available yet.';
      this.cdr.detectChanges();
    }
  }

  backToAreas(): void {
    this.streetStep = false;
    this.selectedStreet = '';
    this.selectedStreetId = null;
    this.isCustomDrawing = false;
    this.clearDrawDeleteControl();
    this.streetSearch = '';
    this.activeStreetPaths = [];
    this.clearStreetFocus();
  }

  chooseArea(area: string): void {
    const normalizedArea = area.trim().toLowerCase();
    const nextAreas = this.selectedAreas.some(
      (selected) => selected.trim().toLowerCase() === normalizedArea,
    )
      ? this.selectedAreas.filter((selected) => selected.trim().toLowerCase() !== normalizedArea)
      : [...this.selectedAreas, area];
    void this.chooseAreas(nextAreas);
  }

  isAreaSelected(area: string): boolean {
    return this.selectedAreas.some(
      (selected) => selected.trim().toLowerCase() === area.trim().toLowerCase(),
    );
  }

  async chooseAreas(areas: string[]): Promise<void> {
    if (!this.draw || !this.map) return;
    const requestedAreas = areas.filter(
      (area, index, list) =>
        area.trim() &&
        list.findIndex(
          (candidate) => candidate.trim().toLowerCase() === area.trim().toLowerCase(),
        ) === index,
    );
    this.selectedAreas = requestedAreas;
    this.setDrawingEnabled(false);
    this.isCustomDrawing = false;
    this.clearDrawDeleteControl();
    this.drawnAreaRevision++;
    const revision = ++this.selectionRevision;
    // Remove the old district immediately. Otherwise it remains visible while
    // the newly selected OSM boundary is being downloaded.
    this.draw.clear();
    this.clearSelectedBoundaryOverlay();
    this.clearStreetLines();
    this.activeStreetPaths = [];
    this.clearStreetFocus();
    this.clearApartmentCountOverlays();
    this.clearApartmentPriceOverlays();
    this.hasPolygon = false;
    this.selectedArea = '';
    this.selectedStreet = '';
    this.selectedStreetId = null;
    // Keep the basemap's street names visible after a district is selected.
    this.setLegacyMapStyles(null);
    const drawableAreas = (
      await Promise.all(
        requestedAreas.map(async (area) => ({
          area,
          polygons: await this.loadBoundary(area),
        })),
      )
    ).filter((item) => item.polygons.length);
    if (revision !== this.selectionRevision) return;
    if (!drawableAreas.length) {
      this.selectedArea = '';
      this.selectedAreas = [];
      this.hasPolygon = false;
      this.polygonChange.emit(null);
      this.cdr.detectChanges();
      return;
    }
    // Street geometry is fetched only by canonical street ID after selection.
    // Selecting a district must not preload or fuzzy-resolve road names.
    // Keep every neighbourhood as its own feature. Joining them with a convex
    // hull also selected the unrequested neighbourhoods between them.
    const features = drawableAreas.flatMap(({ area, polygons }) =>
      polygons.map((coordinates) => ({
        type: 'Feature' as const,
        id: this.draw!.getFeatureId(),
        properties: { mode: 'polygon', name: area },
        geometry: { type: 'Polygon' as const, coordinates },
      })),
    );
    const results = this.draw.addFeatures(features);
    const validFeatures = features.filter((_, index) => results[index]?.valid);
    if (validFeatures.length) {
      this.selectedArea = drawableAreas.map((item) => item.area).join(', ');
      this.selectedAreas = drawableAreas.map((item) => item.area);
      this.selectedStreet = '';
      this.streetSearch = '';
      // Keep approved street geometry available without exposing the old
      // customer-facing street browsing step.
      this.streetStep = false;
      this.hasPolygon = true;
      const bounds = new google.maps.LatLngBounds();
      drawableAreas.forEach(({ polygons }) =>
        polygons.forEach((rings) =>
          rings.forEach((ring) => ring.forEach(([lng, lat]) => bounds.extend({ lat, lng }))),
        ),
      );
      this.map.fitBounds(bounds, 48);
      // The compact home-page map uses a clean listing-map presentation.
      // Keep the district geometry for searching, but do not paint its polygon.
      if (!this.compact) this.renderSelectedBoundaryOverlay(drawableAreas);
      this.renderApartmentCountOverlays(drawableAreas);
      this.renderApartmentPriceOverlays(drawableAreas.map((item) => item.area));
      await this.drawSelectedStreets(this.selectedStreetsInput.length > 0);
      this.cdr.detectChanges();
      this.polygonChange.emit(this.currentPolygon());
    } else {
      console.error('Could not draw selected areas.');
    }
  }

  startDrawing(): void {
    if (this.drawingEnabled) {
      this.setDrawingEnabled(false);
      return;
    }
    this.drawnAreaRevision++;
    this.selectionRevision++;
    this.draw?.clear();
    this.clearSelectedBoundaryOverlay();
    this.clearStreetLines();
    this.activeStreetPaths = [];
    this.clearStreetFocus();
    this.clearApartmentCountOverlays();
    this.clearApartmentPriceOverlays();
    this.selectedArea = '';
    this.selectedAreas = [];
    this.selectedStreet = '';
    this.selectedStreetId = null;
    this.hasPolygon = false;
    this.isCustomDrawing = true;
    this.clearDrawDeleteControl();
    this.setDrawingEnabled(true);
    this.polygonChange.emit(null);
    this.drawnStreetsChange.emit([]);
    this.setLegacyMapStyles(null);
  }

  private setDrawingEnabled(enabled: boolean): void {
    this.drawingEnabled = enabled;
    this.compactMapInteractive = this.compact && enabled;
    this.draw?.setMode(enabled ? 'polyline' : 'render');
    this.cdr.detectChanges();
  }

  private async loadBoundary(area: string): Promise<number[][][][]> {
    const cacheKey = `area:${area.toLowerCase()}`;
    const cached = this.boundaryCache.get(cacheKey);
    if (cached) return cached;
    const pending = DrawAreaMapComponent.boundaryRequests.get(cacheKey);
    if (pending) return pending;
    const request = this.loadPersistedBoundary(area, cacheKey).finally(() =>
      DrawAreaMapComponent.boundaryRequests.delete(cacheKey),
    );
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
      await DrawAreaMapComponent.persistentMapCache.set(`boundary:${cacheKey}`, polygons);
    }
    return polygons;
  }

  private async fetchBoundary(area: string, cacheKey: string): Promise<number[][][][]> {
    try {
      const areaRecord = this.locations
        .filter(
          (location) =>
            location.district.toLowerCase() === area.toLowerCase() ||
            this.locationService.districtName(location, 'ka').toLowerCase() === area.toLowerCase(),
        )
        // The upstream catalog can temporarily contain a legacy duplicate
        // with the same localized name but no geometry. Always choose the
        // approved canonical record when one exists.
        .sort(
          (left, right) =>
            Number(right.geometryStatus === 'approved') -
            Number(left.geometryStatus === 'approved'),
        )[0];
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
    if (!this.selectedStreetsInput.length) {
      this.selectedStreet = '';
      this.selectedStreetId = null;
      return;
    }
    this.selectedStreet = this.selectedStreetsInput
      .map((selection) => selection.street)
      .filter(Boolean)
      .join(', ');
    this.selectedStreetId = this.selectedStreetsInput.at(-1)?.streetId ?? null;
    const paths = (
      await Promise.all(
        this.selectedStreetsInput.map(async (selection) => {
          try {
            const street = await firstValueFrom(this.locationService.getStreet(selection.streetId));
            if (!street.geometry) return [];
            return street.geometry.type === 'LineString'
              ? [street.geometry.coordinates as number[][]]
              : (street.geometry.coordinates as number[][][]);
          } catch {
            return [];
          }
        }),
      )
    ).flat();
    if (revision !== this.streetRevision) return;
    this.clearStreetLines();
    this.activeStreetPaths = paths;
    this.renderStreetPaths(paths, fitToStreets);
    if (paths.length) {
      this.renderStreetFocus(paths, this.selectedStreet);
      this.renderApartmentPriceOverlays(this.activePriceAreas);
      this.errorMessage = '';
    } else if (fitToStreets) {
      const focused = await this.focusStreetByAddress(this.selectedStreetsInput.at(-1)!);
      this.errorMessage = focused ? '' : `${this.selectedStreet} could not be located on the map.`;
    }
    this.cdr.detectChanges();
  }

  private async focusStreetByAddress(street: {
    street?: string;
    label?: string;
    value?: string;
    district?: string;
  }): Promise<boolean> {
    if (!this.map) return false;
    const streetName = street.street || street.label || street.value || '';
    if (!streetName) return false;

    try {
      const { Geocoder } = (await importLibrary('geocoding')) as google.maps.GeocodingLibrary;
      const response = await new Geocoder().geocode({
        address: [streetName, street.district, 'Tbilisi, Georgia'].filter(Boolean).join(', '),
      });
      const match = response.results[0];
      if (!match) return false;

      const position = match.geometry.location;
      this.map.setCenter(position);
      this.map.setZoom(17);
      this.renderStreetPointFocus(position, streetName);
      return true;
    } catch {
      return false;
    }
  }

  private renderStreetPointFocus(position: google.maps.LatLng, streetName: string): void {
    if (!this.map) return;
    this.clearStreetFocus();
    const map = this.map;
    const overlay = new google.maps.OverlayView();
    let marker: HTMLDivElement | undefined;
    overlay.onAdd = () => {
      marker = document.createElement('div');
      marker.className = 'street-point-focus';
      marker.setAttribute('aria-label', `Selected street: ${streetName}`);
      marker.innerHTML = '<i class="fa-solid fa-location-dot" aria-hidden="true"></i><span></span>';
      const label = marker.querySelector('span');
      if (label) label.textContent = streetName;
      Object.assign(marker.style, {
        position: 'absolute',
        transform: 'translate(-50%, -100%)',
        padding: '8px 11px',
        borderRadius: '10px',
        color: '#fff',
        background: '#d93025',
        boxShadow: '0 8px 22px rgba(217,48,37,.3)',
        fontSize: '11px',
        fontWeight: '800',
        whiteSpace: 'nowrap',
      });
      overlay.getPanes()?.floatPane.appendChild(marker);
    };
    overlay.draw = () => {
      if (!marker) return;
      const point = overlay.getProjection().fromLatLngToDivPixel(position);
      if (!point) return;
      marker.style.left = `${point.x}px`;
      marker.style.top = `${point.y}px`;
    };
    overlay.onRemove = () => marker?.remove();
    overlay.setMap(map);
    this.streetFocusOverlay = overlay;
  }

  private renderStreetPaths(paths: number[][][], fitToStreets: boolean): void {
    if (!this.map) return;
    const bounds = new google.maps.LatLngBounds();
    for (const path of paths) {
      path.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
    }

    const map = this.map;
    const glow = new google.maps.OverlayView();
    let canvas: HTMLCanvasElement | undefined;
    glow.onAdd = () => {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, {
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: '1',
        mixBlendMode: 'multiply',
      });
      glow.getPanes()?.overlayMouseTarget.appendChild(canvas);
    };
    glow.draw = () => {
      if (!canvas) return;
      const visibleBounds = map.getBounds();
      if (!visibleBounds) return;
      const projection = glow.getProjection();
      const northEast = projection.fromLatLngToDivPixel(visibleBounds.getNorthEast());
      const southWest = projection.fromLatLngToDivPixel(visibleBounds.getSouthWest());
      if (!northEast || !southWest) return;
      const originX = Math.min(northEast.x, southWest.x);
      const originY = Math.min(northEast.y, southWest.y);
      const width = Math.max(1, Math.abs(northEast.x - southWest.x));
      const height = Math.max(1, Math.abs(southWest.y - northEast.y));
      const shortestSide = Math.min(
        map.getDiv().clientWidth || width,
        map.getDiv().clientHeight || height,
      );
      const viewportScale = Math.max(0.68, Math.min(1.16, shortestSide / 560));
      const zoom = map.getZoom() || 15;
      const zoomScale = Math.max(0.82, Math.min(1.12, 1 + (15 - zoom) * 0.055));
      const glowScale = viewportScale * zoomScale;
      const outerWidth = Math.round(70 * glowScale);
      const middleWidth = Math.round(42 * glowScale);
      const innerWidth = Math.round(17 * glowScale);
      const overscan = Math.ceil(outerWidth / 2 + 18 * glowScale);
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const canvasWidth = width + overscan * 2;
      const canvasHeight = height + overscan * 2;
      canvas.width = Math.round(canvasWidth * scale);
      canvas.height = Math.round(canvasHeight * scale);
      canvas.style.left = `${originX - overscan}px`;
      canvas.style.top = `${originY - overscan}px`;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      canvas.style.filter = `blur(${Math.max(8, Math.round(13 * glowScale))}px)`;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(scale, scale);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      const drawGlowLayer = (widthPx: number, opacity: number, color: string) => {
        context.lineWidth = widthPx;
        context.strokeStyle = color;
        context.globalAlpha = opacity;
        for (const path of paths) {
          context.beginPath();
          let hasPoint = false;
          path.forEach(([lng, lat], index) => {
            const point = glow.getProjection().fromLatLngToDivPixel({ lat, lng });
            if (!point) return;
            const x = point.x - originX + overscan;
            const y = point.y - originY + overscan;
            if (!hasPoint || index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
            hasPoint = true;
          });
          if (hasPoint) context.stroke();
        }
      };

      drawGlowLayer(outerWidth, 0.18, '#ddd6fe');
      drawGlowLayer(middleWidth, 0.27, '#c4b5fd');
      drawGlowLayer(innerWidth, 0.2, '#a78bfa');
      context.globalAlpha = 1;
    };
    glow.onRemove = () => {
      canvas?.remove();
      canvas = undefined;
    };
    glow.setMap(map);
    this.streetLines.push(glow);

    // Draw the approved road centre line above the district polygon. This is
    // generic for every street returned by the API, including MultiLineString
    // roads split into disconnected sections.
    for (const path of paths) {
      const line = new google.maps.Polyline({
        map,
        path: path.map(([lng, lat]) => ({ lat, lng })),
        clickable: false,
        strokeColor: '#d93025',
        strokeOpacity: 0.95,
        strokeWeight: 4,
        zIndex: 30,
      });
      this.streetLines.push(line);
    }

    if (fitToStreets && !bounds.isEmpty()) this.map.fitBounds(bounds, 90);
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
      const {
        TerraDraw,
        TerraDrawPolygonMode,
        TerraDrawPolyLineMode,
        TerraDrawSelectMode,
        TerraDrawRenderMode,
      } = terraDraw;
      const { TerraDrawGoogleMapsAdapter } = googleAdapter;
      this.map = new Map(mapElement.nativeElement, {
        center: { lat: 41.7151, lng: 44.8271 },
        zoom: 12,
        ...(mapId ? { mapId } : {}),
        minZoom: 11,
        maxZoom: 20,
        restriction: {
          latLngBounds: DrawAreaMapComponent.tbilisiMapBounds,
          strictBounds: true,
        },
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
      this.zoomListener = this.map.addListener('zoom_changed', () =>
        this.syncApartmentOverlayVisibility(),
      );

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
              // Approved district features are displayed by the dedicated
              // Google overlay, which supports the dotted place-boundary look.
              fillColor: '#d93025',
              fillOpacity: 0,
              outlineColor: '#d93025',
              outlineWidth: 0,
            },
          }),
          new TerraDrawPolyLineMode({
            validation: (feature, context) => {
              const distinctPoints = this.distinctPolygonPointCount(feature);
              return {
                valid:
                  context.updateType !== 'finish' ||
                  feature.geometry.type !== 'Polygon' ||
                  distinctPoints >= 4,
                reason: 'Choose at least four points to draw an area.',
              };
            },
            styles: {
              lineStringColor: '#451a8f',
              lineStringWidth: 3,
              polygonFillColor: '#451a8f',
              polygonFillOpacity: 0.1,
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
              selectedPolygonFillOpacity: 0.1,
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
          new TerraDrawRenderMode({ modeName: 'render', styles: {} }),
        ],
      });
      this.draw.start();
      this.setDrawingEnabled(false);
      this.draw.on('finish', () => {
        const polygons =
          this.draw?.getSnapshot().filter((feature) => feature.geometry?.type === 'Polygon') || [];
        if (polygons.length > 1)
          this.draw?.removeFeatures(polygons.slice(0, -1).map((feature) => feature.id));
        const latest = this.draw
          ?.getSnapshot()
          .find((feature) => feature.geometry?.type === 'Polygon');
        if (latest && this.distinctPolygonPointCount(latest) < 4) {
          this.draw?.removeFeatures([latest.id]);
          this.draw?.setMode('polyline');
          this.hasPolygon = false;
          this.polygonChange.emit(null);
          this.cdr.detectChanges();
          return;
        }
        this.hasPolygon = !!latest;
        const polygon = this.currentPolygon();
        this.polygonChange.emit(polygon);
        if (polygon) void this.emitDrawnAreaStreets(polygon);
        if (polygon) {
          this.isCustomDrawing = true;
          this.renderDrawDeleteControl(polygon);
          this.clearApartmentCountOverlays();
          this.renderApartmentPriceOverlays([], polygon);
          this.setDrawingEnabled(false);
        }
        this.cdr.detectChanges();
      });
      this.draw.on('change', () => {
        this.hasPolygon = !!this.currentPolygon();
        if (!this.hasPolygon) this.selectedArea = '';
        const polygon = this.currentPolygon();
        this.polygonChange.emit(polygon);
        if (this.isCustomDrawing && polygon) {
          this.renderDrawDeleteControl(polygon);
          this.renderApartmentPriceOverlays([], polygon);
        } else if (!polygon) {
          this.clearDrawDeleteControl();
          this.clearApartmentPriceOverlays();
          this.clearPropertyPreview();
        }
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

  private refreshApartmentCountOverlays(): void {
    const selected = this.selectedArea
      .split(',')
      .map((area) => area.trim())
      .filter(Boolean);
    if (!selected.length) return;
    void Promise.all(
      selected.map(async (area) => ({ area, polygons: await this.loadBoundary(area) })),
    ).then((areas) => {
      const drawableAreas = areas.filter((item) => item.polygons.length);
      this.renderApartmentCountOverlays(drawableAreas);
      this.renderApartmentPriceOverlays(drawableAreas.map((item) => item.area));
    });
  }

  private renderApartmentCountOverlays(
    areas: Array<{ area: string; polygons: number[][][][] }>,
  ): void {
    if (!this.map) return;
    this.clearApartmentCountOverlays();

    for (const { area, polygons } of areas) {
      // Use the largest outer ring and its visual bounds. Averaging vertices
      // biases the marker toward detailed edges instead of the district center.
      const points =
        polygons
          .map((polygon) => polygon[0] || [])
          .sort((left, right) => right.length - left.length)[0] || [];
      if (!points.length) continue;
      const extent = points.reduce(
        (bounds, [lng, lat]) => ({
          minLat: Math.min(bounds.minLat, lat),
          maxLat: Math.max(bounds.maxLat, lat),
          minLng: Math.min(bounds.minLng, lng),
          maxLng: Math.max(bounds.maxLng, lng),
        }),
        { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity },
      );
      const center = {
        lat: (extent.minLat + extent.maxLat) / 2,
        lng: (extent.minLng + extent.maxLng) / 2,
      };
      const count = this.apartments.filter(
        (apartment) =>
          (apartment.district || '').trim().toLowerCase() === area.trim().toLowerCase(),
      ).length;

      const overlay = new google.maps.OverlayView();
      let badge: HTMLDivElement | undefined;
      overlay.onAdd = () => {
        badge = document.createElement('div');
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-label', `${count} apartments in ${area}`);
        badge.innerHTML = `<strong>${count}</strong><span>განცხადება</span><i></i>`;
        Object.assign(badge.style, {
          position: 'absolute',
          transform: 'translate(-50%, -100%) scale(.66)',
          transformOrigin: 'bottom center',
          width: '112px',
          height: '106px',
          color: '#fff',
          filter: 'drop-shadow(0 7px 9px rgba(69, 26, 143, .3))',
          textAlign: 'center',
          fontFamily: 'inherit',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: '10',
        });
        const strong = badge.querySelector('strong') as HTMLElement;
        const label = badge.querySelector('span') as HTMLElement;
        const tail = badge.querySelector('i') as HTMLElement;
        Object.assign(strong.style, {
          position: 'absolute',
          top: '0',
          left: '20px',
          display: 'grid',
          placeItems: 'center',
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: '#5b21d1',
          fontSize: '34px',
          lineHeight: '1',
          fontWeight: '500',
          zIndex: '1',
        });
        Object.assign(label.style, {
          position: 'absolute',
          top: '62px',
          left: '0',
          display: 'grid',
          placeItems: 'center',
          width: '112px',
          height: '32px',
          borderRadius: '18px',
          background: '#5b21d1',
          fontSize: '12px',
          lineHeight: '1',
          fontWeight: '700',
          zIndex: '2',
        });
        Object.assign(tail.style, {
          position: 'absolute',
          top: '87px',
          left: '44px',
          display: 'block',
          width: '0',
          height: '0',
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: '17px solid #5b21d1',
          zIndex: '1',
        });
        overlay.getPanes()?.floatPane.appendChild(badge);
      };
      overlay.draw = () => {
        const pixel = overlay.getProjection().fromLatLngToDivPixel(center);
        if (badge && pixel) {
          badge.style.left = `${pixel.x}px`;
          badge.style.top = `${pixel.y}px`;
        }
      };
      overlay.onRemove = () => {
        badge?.remove();
        badge = undefined;
      };
      overlay.setMap(this.map);
      this.countOverlays.push(overlay);
    }
    this.syncApartmentOverlayVisibility();
  }

  private clearApartmentCountOverlays(): void {
    this.countOverlays.forEach((overlay) => overlay.setMap(null));
    this.countOverlays = [];
  }

  private renderApartmentPriceOverlays(areas: string[], polygon?: GeoJsonPolygon | null): void {
    if (!this.map) return;
    this.activePriceAreas = areas;
    this.clearApartmentPriceOverlays();
    const selectedAreas = new Set(areas.map((area) => area.trim().toLowerCase()));
    const listings = this.apartments.flatMap((apartment) => {
      const position = this.resolveApartmentPosition(apartment);
      const lat = position?.lat;
      const lng = position?.lng;
      const isInSelectedArea =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        (polygon
          ? this.pointInsidePolygon(lng!, lat!, polygon.coordinates[0] || [])
          : selectedAreas.has((apartment.district || '').trim().toLowerCase()));
      if (!isInSelectedArea) return [];
      if (this.activeStreetPaths.length && this.distanceToStreetKm(lat!, lng!) > 1.2) return [];
      return [{ apartment, position: position! }];
    });

    for (const { apartment, position } of listings) {
      const price = `$${Math.round(apartment.price).toLocaleString('en-US')}`;
      const overlay = new google.maps.OverlayView();
      let pin: HTMLDivElement | undefined;
      overlay.onAdd = () => {
        pin = document.createElement('div');
        pin.textContent = price;
        pin.setAttribute('role', 'button');
        pin.setAttribute('tabindex', '0');
        pin.setAttribute('aria-label', `Open ${apartment.title}, ${price}`);
        Object.assign(pin.style, {
          position: 'absolute',
          transform: 'translate(-50%, -100%)',
          minWidth: '58px',
          padding: '10px 12px',
          borderRadius: '22px',
          background: '#fff',
          color: '#171421',
          border: '1px solid rgba(60, 48, 67, .12)',
          boxShadow: '0 6px 16px rgba(25, 16, 31, .22)',
          fontFamily: 'inherit',
          fontSize: '12px',
          lineHeight: '1',
          fontWeight: '800',
          whiteSpace: 'nowrap',
          pointerEvents: 'auto',
          cursor: 'pointer',
          zIndex: '9',
        });
        const tail = document.createElement('i');
        Object.assign(tail.style, {
          position: 'absolute',
          left: '50%',
          bottom: '-5px',
          width: '10px',
          height: '10px',
          background: '#fff',
          transform: 'translateX(-50%) rotate(45deg)',
          boxShadow: '3px 3px 5px rgba(25, 16, 31, .08)',
        });
        pin.appendChild(tail);
        const setPinHighlighted = (highlighted: boolean) => {
          const active = this.previewApartmentId === apartment.id;
          const selected = highlighted || active;
          pin!.style.background = selected ? '#451a8f' : '#fff';
          pin!.style.color = selected ? '#fff' : '#171421';
          pin!.style.transform = selected
            ? 'translate(-50%, -100%) scale(1.08)'
            : 'translate(-50%, -100%)';
          pin!.style.boxShadow = selected
            ? '0 8px 20px rgba(69, 26, 143, .34)'
            : '0 6px 16px rgba(25, 16, 31, .22)';
          tail.style.background = selected ? '#451a8f' : '#fff';
        };
        const openPreview = (event: Event) => {
          event.stopPropagation();
          this.showPropertyPreview(apartment, position, pin!, tail);
        };
        pin.addEventListener('click', openPreview);
        pin.addEventListener('pointerenter', () => setPinHighlighted(true));
        pin.addEventListener('pointerleave', () => setPinHighlighted(false));
        pin.addEventListener('focus', () => setPinHighlighted(true));
        pin.addEventListener('blur', () => setPinHighlighted(false));
        pin.addEventListener('keydown', (event) => {
          if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') {
            event.preventDefault();
            openPreview(event);
          }
        });
        overlay.getPanes()?.floatPane.appendChild(pin);
      };
      overlay.draw = () => {
        const pixel = overlay.getProjection().fromLatLngToDivPixel(position);
        if (pin && pixel) {
          pin.style.left = `${pixel.x}px`;
          pin.style.top = `${pixel.y}px`;
        }
      };
      overlay.onRemove = () => {
        pin?.remove();
        pin = undefined;
      };
      this.priceOverlays.push(overlay);
    }
    this.syncApartmentOverlayVisibility();
  }

  private resolveApartmentPosition(apartment: Apartment): google.maps.LatLngLiteral | null {
    const rawLat = apartment.propertyLatitude ?? apartment.latitude;
    const rawLng = apartment.propertyLongitude ?? apartment.longitude;
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (
      rawLat != null &&
      rawLng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= DrawAreaMapComponent.tbilisiMapBounds.south &&
      lat <= DrawAreaMapComponent.tbilisiMapBounds.north &&
      lng >= DrawAreaMapComponent.tbilisiMapBounds.west &&
      lng <= DrawAreaMapComponent.tbilisiMapBounds.east
    ) return { lat, lng };

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
    const center = districtCenters[(apartment.district || '').trim().toLowerCase()];
    if (!center) return null;

    // Separate privacy-redacted listings so their price pins remain clickable.
    const angle = ((apartment.id * 137.5) % 360) * (Math.PI / 180);
    const radius = 0.002 + (apartment.id % 4) * 0.00075;
    return {
      lat: center.lat + Math.sin(angle) * radius,
      lng: center.lng + Math.cos(angle) * radius,
    };
  }

  private syncApartmentOverlayVisibility(): void {
    if (!this.map) return;
    const showPrices = this.compact || !!this.activeStreetPaths.length || (this.map.getZoom() || 0) >= 15;
    this.countOverlays.forEach((overlay) => overlay.setMap(showPrices ? null : this.map!));
    this.priceOverlays.forEach((overlay) => overlay.setMap(showPrices ? this.map! : null));
  }

  private clearApartmentPriceOverlays(): void {
    this.clearPropertyPreview();
    this.priceOverlays.forEach((overlay) => overlay.setMap(null));
    this.priceOverlays = [];
  }

  private pointInsidePolygon(longitude: number, latitude: number, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (
        yi > latitude !== yj > latitude &&
        longitude < ((xj - xi) * (latitude - yi)) / (yj - yi || Number.EPSILON) + xi
      ) inside = !inside;
    }
    return inside;
  }

  private showPropertyPreview(
    apartment: Apartment,
    position: google.maps.LatLngLiteral,
    pin: HTMLDivElement,
    tail: HTMLElement,
  ): void {
    if (!this.map) return;
    if (this.previewApartmentId === apartment.id) {
      this.clearPropertyPreview();
      return;
    }
    this.clearPropertyPreview();
    this.previewApartmentId = apartment.id;
    this.activePreviewPin = pin;
    this.activePreviewTail = tail;
    pin.style.background = '#451a8f';
    pin.style.color = '#fff';
    pin.style.transform = 'translate(-50%, -100%) scale(1.08)';
    pin.style.boxShadow = '0 8px 20px rgba(69, 26, 143, .34)';
    tail.style.background = '#451a8f';
    const overlay = new google.maps.OverlayView();
    let card: HTMLDivElement | undefined;
    overlay.onAdd = () => {
      card = document.createElement('div');
      const images = (apartment.imageUrls || []).filter(Boolean);
      if (!images.length) images.push(apartment.imageUrl || '/property-placeholder.svg');
      let imageIndex = 0;
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', apartment.title || 'Property details');
      card.innerHTML = `
        <button type="button" data-close aria-label="Close property preview">&times;</button>
        <div data-gallery><img src="${this.escapeAttribute(images[0])}" alt="" />
        ${images.length > 1 ? '<button type="button" data-previous aria-label="Previous image">&#8249;</button><button type="button" data-next aria-label="Next image">&#8250;</button>' : ''}</div>
        <div data-body><b>$${Math.round(apartment.price).toLocaleString('en-US')}</b>
        <small>${apartment.bedrooms || '—'} beds · ${apartment.sizeSquareMeters || '—'} m²</small></div>`;
      Object.assign(card.style, {
        position: 'absolute', width: '246px', height: '112px', overflow: 'hidden', borderRadius: '14px',
        display: 'grid', gridTemplateColumns: '158px 1fr',
        background: '#fff', color: '#171421', boxShadow: '0 16px 38px rgba(28,17,36,.28)',
        transform: 'translate(-50%, calc(-100% - 42px))', fontFamily: 'Inter,system-ui,sans-serif',
        cursor: 'pointer', zIndex: '30'
      });
      const gallery = card.querySelector('[data-gallery]') as HTMLDivElement;
      Object.assign(gallery.style, { position: 'relative', width: '158px', height: '112px', overflow: 'hidden' });
      const img = gallery.querySelector('img') as HTMLImageElement;
      Object.assign(img.style, { width: '158px', height: '112px', display: 'block', objectFit: 'cover' });
      const changeImage = (event: Event, direction: number) => {
        event.stopPropagation();
        imageIndex = (imageIndex + direction + images.length) % images.length;
        img.src = images[imageIndex];
      };
      const previous = gallery.querySelector('[data-previous]') as HTMLButtonElement | null;
      const next = gallery.querySelector('[data-next]') as HTMLButtonElement | null;
      if (previous && next) {
        const arrowCss = 'position:absolute;z-index:2;top:50%;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:#fff;color:#171421;font-size:24px;line-height:25px;cursor:pointer;box-shadow:0 2px 7px #0003;transform:translateY(-50%)';
        previous.style.cssText = `${arrowCss};left:6px`;
        next.style.cssText = `${arrowCss};right:6px`;
        previous.addEventListener('click', (event) => changeImage(event, -1));
        next.addEventListener('click', (event) => changeImage(event, 1));
      }
      const body = card.querySelector('[data-body]') as HTMLDivElement;
      Object.assign(body.style, { padding: '17px 7px 8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px' });
      (body.querySelector('small') as HTMLElement).style.cssText = 'font-size:9px;font-weight:650;color:#6e6878;white-space:nowrap';
      (body.querySelector('b') as HTMLElement).style.cssText = 'font-size:15px;color:#451a8f;white-space:nowrap';
      const close = card.querySelector('[data-close]') as HTMLButtonElement;
      close.style.cssText = 'position:absolute;z-index:2;top:5px;right:5px;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:#f5f2f8;color:#4b4452;font-size:17px;line-height:22px;cursor:pointer';
      close.addEventListener('click', (event) => { event.stopPropagation(); this.clearPropertyPreview(); });
      card.addEventListener('click', () => void this.router.navigate(['/apartments', apartment.id]));
      overlay.getPanes()?.floatPane.appendChild(card);
    };
    overlay.draw = () => {
      const pixel = overlay.getProjection().fromLatLngToDivPixel(position);
      if (card && pixel) { card.style.left = `${pixel.x}px`; card.style.top = `${pixel.y}px`; }
    };
    overlay.onRemove = () => { card?.remove(); card = undefined; };
    overlay.setMap(this.map);
    this.propertyPreviewOverlay = overlay;
  }

  private clearPropertyPreview(): void {
    this.propertyPreviewOverlay?.setMap(null);
    this.propertyPreviewOverlay = undefined;
    if (this.activePreviewPin) {
      this.activePreviewPin.style.background = '#fff';
      this.activePreviewPin.style.color = '#171421';
      this.activePreviewPin.style.transform = 'translate(-50%, -100%)';
      this.activePreviewPin.style.boxShadow = '0 6px 16px rgba(25, 16, 31, .22)';
    }
    if (this.activePreviewTail) this.activePreviewTail.style.background = '#fff';
    this.activePreviewPin = undefined;
    this.activePreviewTail = undefined;
    this.previewApartmentId = null;
  }

  private escapeHtml(value: string): string {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value).replace(/`/g, '&#96;');
  }

  private distanceToStreetKm(latitude: number, longitude: number): number {
    let closest = Infinity;
    const latitudeScale = 111.32;
    const longitudeScale = latitudeScale * Math.cos((latitude * Math.PI) / 180);
    for (const path of this.activeStreetPaths) {
      for (let index = 1; index < path.length; index++) {
        const [startLng, startLat] = path[index - 1];
        const [endLng, endLat] = path[index];
        const x = longitude * longitudeScale;
        const y = latitude * latitudeScale;
        const x1 = startLng * longitudeScale;
        const y1 = startLat * latitudeScale;
        const x2 = endLng * longitudeScale;
        const y2 = endLat * latitudeScale;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        const ratio = lengthSquared
          ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared))
          : 0;
        closest = Math.min(closest, Math.hypot(x - (x1 + ratio * dx), y - (y1 + ratio * dy)));
      }
    }
    return closest;
  }

  private renderStreetFocus(paths: number[][][], streetName: string): void {
    if (!this.map) return;
    this.clearStreetFocus();
    const midpoint = this.streetMidpoint(paths);
    if (!midpoint) return;
    const [lng, lat] = midpoint;
    const position = { lat, lng };
    const overlay = new google.maps.OverlayView();
    let marker: HTMLDivElement | undefined;
    overlay.onAdd = () => {
      marker = document.createElement('div');
      marker.setAttribute('aria-label', `Selected street: ${streetName}`);
      marker.innerHTML = `<em></em><b><i class="fa-solid fa-house"></i><u></u></b><span></span>`;
      const icon = marker.querySelector('b') as HTMLElement;
      const label = marker.querySelector('span') as HTMLElement;
      const tail = marker.querySelector('u') as HTMLElement;
      const glow = marker.querySelector('em') as HTMLElement;
      label.textContent = streetName;
      Object.assign(marker.style, {
        position: 'absolute',
        transform: 'translate(-21px, -54px)',
        display: 'flex',
        alignItems: 'center',
        height: '42px',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        filter: 'drop-shadow(0 5px 10px rgba(69, 26, 143, .25))',
        zIndex: '11',
      });
      Object.assign(icon.style, {
        position: 'relative',
        width: '42px',
        height: '42px',
        display: 'grid',
        placeItems: 'center',
        borderRadius: '50%',
        background: '#5b21d1',
        color: '#fff',
        fontSize: '17px',
        zIndex: '2',
      });
      icon.animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-7px)' },
          { transform: 'translateY(0)' },
        ],
        { duration: 1800, iterations: Infinity, easing: 'ease-in-out' },
      );
      Object.assign(label.style, {
        maxWidth: '190px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginLeft: '-5px',
        padding: '7px 12px 7px 14px',
        borderRadius: '0 14px 14px 0',
        background: '#fff',
        color: '#5b21b6',
        fontSize: '11px',
        fontWeight: '800',
        zIndex: '1',
      });
      Object.assign(tail.style, {
        position: 'absolute',
        left: '13px',
        bottom: '-10px',
        width: '0',
        height: '0',
        textDecoration: 'none',
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: '13px solid #5b21d1',
      });
      Object.assign(glow.style, {
        position: 'absolute',
        left: '-17px',
        top: '43px',
        width: '76px',
        height: '24px',
        borderRadius: '50%',
        background:
          'radial-gradient(ellipse, rgba(109, 40, 217, .34) 0%, rgba(139, 92, 246, .17) 44%, rgba(196, 181, 253, 0) 75%)',
        zIndex: '0',
        pointerEvents: 'none',
      });
      overlay.getPanes()?.floatPane.appendChild(marker);
    };
    overlay.draw = () => {
      const pixel = overlay.getProjection().fromLatLngToDivPixel(position);
      if (marker && pixel) {
        marker.style.left = `${pixel.x}px`;
        marker.style.top = `${pixel.y}px`;
      }
    };
    overlay.onRemove = () => {
      marker?.remove();
      marker = undefined;
    };
    overlay.setMap(this.map);
    this.streetFocusOverlay = overlay;
  }

  private streetMidpoint(paths: number[][][]): [number, number] | null {
    const segments: Array<{ start: number[]; end: number[]; length: number }> = [];
    let totalLength = 0;
    for (const path of paths) {
      for (let index = 1; index < path.length; index++) {
        const start = path[index - 1];
        const end = path[index];
        const meanLatitude = ((start[1] + end[1]) / 2) * (Math.PI / 180);
        const dx = (end[0] - start[0]) * Math.cos(meanLatitude);
        const dy = end[1] - start[1];
        const length = Math.hypot(dx, dy);
        if (!length) continue;
        segments.push({ start, end, length });
        totalLength += length;
      }
    }
    if (!segments.length) return (paths[0]?.[0] as [number, number] | undefined) || null;

    const halfway = totalLength / 2;
    let travelled = 0;
    for (const segment of segments) {
      if (travelled + segment.length >= halfway) {
        const ratio = (halfway - travelled) / segment.length;
        return [
          segment.start[0] + (segment.end[0] - segment.start[0]) * ratio,
          segment.start[1] + (segment.end[1] - segment.start[1]) * ratio,
        ];
      }
      travelled += segment.length;
    }
    const last = segments[segments.length - 1].end;
    return [last[0], last[1]];
  }

  private clearStreetFocus(): void {
    this.streetFocusOverlay?.setMap(null);
    this.streetFocusOverlay = undefined;
  }

  private renderDrawDeleteControl(polygon: GeoJsonPolygon): void {
    if (!this.map) return;
    this.clearDrawDeleteControl();
    const ring = polygon.coordinates[0];
    if (!ring?.length) return;
    const [lng, lat] = ring.reduce((best, point) =>
      point[0] + point[1] > best[0] + best[1] ? point : best,
    );
    const position = { lat, lng };
    const overlay = new google.maps.OverlayView();
    let button: HTMLButtonElement | undefined;
    overlay.onAdd = () => {
      button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'Delete drawn area');
      button.title = 'Delete drawn area';
      button.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
      Object.assign(button.style, {
        position: 'absolute',
        width: '32px',
        minWidth: '32px',
        maxWidth: '32px',
        height: '32px',
        minHeight: '32px',
        maxHeight: '32px',
        boxSizing: 'border-box',
        appearance: 'none',
        display: 'grid',
        placeItems: 'center',
        padding: '0',
        margin: '0',
        lineHeight: '1',
        border: '2px solid #6d28d9',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, .98)',
        color: '#5b21b6',
        boxShadow: '0 4px 12px rgba(69, 26, 143, .24), 0 0 0 3px rgba(255, 255, 255, .72)',
        fontSize: '12px',
        cursor: 'pointer',
        transform: 'translate(-50%, -50%)',
        transition:
          'transform .16s ease, background .16s ease, color .16s ease, box-shadow .16s ease',
        zIndex: '20',
      });
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      button.addEventListener('mouseenter', () => {
        if (!button) return;
        button.style.background = '#5b21b6';
        button.style.color = '#fff';
        button.style.transform = 'translate(-50%, -50%) scale(1.08)';
        button.style.boxShadow =
          '0 6px 16px rgba(69, 26, 143, .34), 0 0 0 3px rgba(255, 255, 255, .82)';
      });
      button.addEventListener('mouseleave', () => {
        if (!button) return;
        button.style.background = 'rgba(255, 255, 255, .98)';
        button.style.color = '#5b21b6';
        button.style.transform = 'translate(-50%, -50%)';
        button.style.boxShadow =
          '0 4px 12px rgba(69, 26, 143, .24), 0 0 0 3px rgba(255, 255, 255, .72)';
      });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.clearArea();
      });
      overlay.getPanes()?.floatPane.appendChild(button);
    };
    overlay.draw = () => {
      const point = overlay.getProjection().fromLatLngToDivPixel(position);
      if (!button || !point) return;
      button.style.left = `${point.x}px`;
      button.style.top = `${point.y}px`;
    };
    overlay.onRemove = () => {
      button?.remove();
      button = undefined;
    };
    overlay.setMap(this.map);
    this.drawnDeleteOverlay = overlay;
  }

  private clearDrawDeleteControl(): void {
    this.drawnDeleteOverlay?.setMap(null);
    this.drawnDeleteOverlay = undefined;
  }

  private distinctPolygonPointCount(feature: {
    geometry?: { type?: string; coordinates?: unknown };
  }): number {
    if (feature.geometry?.type !== 'Polygon' || !Array.isArray(feature.geometry.coordinates))
      return 0;
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
      const center = ring
        .reduce((sum, [longitude, latitude]) => [sum[0] + longitude, sum[1] + latitude], [0, 0])
        .map((value) => value / ring.length);
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
