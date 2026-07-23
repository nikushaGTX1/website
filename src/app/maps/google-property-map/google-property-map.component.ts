import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

type PlaceCategory = 'school' | 'preschool' | 'supermarket' | 'hospital' | 'transit_station';
type CategoryFilter = PlaceCategory | 'all';
type TravelModeName = 'WALKING' | 'DRIVING' | 'TRANSIT';
interface NearbyPlace {
  id: string;
  name: string;
  address: string;
  category: PlaceCategory;
  location: google.maps.LatLng;
  distanceMeters: number;
  walkingMinutes?: number;
}

@Component({
  selector: 'app-google-property-map',
  standalone: false,
  templateUrl: './google-property-map.component.html',
  styleUrl: './google-property-map.component.css',
})
export class GooglePropertyMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) address = '';
  @Input() apartmentTitle = 'Apartment';
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('directionsPanel') directionsPanel?: ElementRef<HTMLDivElement>;
  loading = true;
  searching = false;
  errorMessage = '';
  searchQuery = '';
  activeCategory: CategoryFilter = 'all';
  travelMode: TravelModeName = 'WALKING';
  selectedPlace?: NearbyPlace;
  readonly categories: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'All nearby' },
    { value: 'school', label: 'Schools' },
    { value: 'preschool', label: 'Kindergartens' },
    { value: 'supermarket', label: 'Groceries' },
    { value: 'hospital', label: 'Healthcare' },
    { value: 'transit_station', label: 'Transport' },
  ];
  private map?: google.maps.Map;
  private apartmentLocation?: google.maps.LatLng;
  private apartmentMarker?: google.maps.Marker;
  private placeMarkers: google.maps.Marker[] = [];
  private directionsRenderer?: google.maps.DirectionsRenderer;
  private viewReady = false;
  private allPlaces: NearbyPlace[] = [];

  get places(): NearbyPlace[] {
    return this.activeCategory === 'all'
      ? this.allPlaces
      : this.allPlaces.filter((place) => place.category === this.activeCategory);
  }
  get nearestPlaces(): NearbyPlace[] {
    return this.categories
      .filter(
        (category): category is { value: PlaceCategory; label: string } => category.value !== 'all',
      )
      .flatMap((category) => {
        const nearest = this.allPlaces
          .filter((place) => place.category === category.value)
          .sort((a, b) => (a.walkingMinutes ?? 9999) - (b.walkingMinutes ?? 9999))[0];
        return nearest ? [nearest] : [];
      });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.initialize();
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (this.viewReady && changes['address']) void this.initialize();
  }
  ngOnDestroy(): void {
    this.clearPlaceMarkers();
    this.apartmentMarker?.setMap(null);
    this.directionsRenderer?.setMap(null);
  }

  selectCategory(category: CategoryFilter): void {
    this.activeCategory = category;
    this.searchQuery = '';
    this.selectedPlace = undefined;
    this.directionsRenderer?.setMap(null);
    this.drawMarkers();
  }
  async search(): Promise<void> {
    if (!this.searchQuery.trim() || !this.apartmentLocation) return;
    this.searching = true;
    this.errorMessage = '';
    try {
      const { Place, SearchByTextRankPreference } = (await importLibrary(
        'places',
      )) as google.maps.PlacesLibrary;
      const response = await Place.searchByText({
        textQuery: this.searchQuery.trim(),
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'primaryType'],
        locationBias: this.apartmentLocation,
        maxResultCount: 15,
        rankPreference: SearchByTextRankPreference.DISTANCE,
      });
      await this.applyPlaces(
        response.places,
        this.activeCategory === 'all' ? 'school' : this.activeCategory,
      );
    } catch {
      this.errorMessage = 'Nearby search is temporarily unavailable.';
    } finally {
      this.searching = false;
    }
  }
  async showDirections(place: NearbyPlace): Promise<void> {
    if (!this.map || !this.apartmentLocation) return;
    this.selectedPlace = place;
    this.errorMessage = '';
    try {
      const { DirectionsService, DirectionsRenderer, TravelMode } = (await importLibrary(
        'routes',
      )) as google.maps.RoutesLibrary;
      this.directionsRenderer?.setMap(null);
      const renderer = new DirectionsRenderer({
        map: this.map,
        panel: this.directionsPanel?.nativeElement,
        suppressMarkers: false,
      });
      this.directionsRenderer = renderer;
      const result = await new DirectionsService().route({
        origin: this.apartmentLocation,
        destination: place.location,
        travelMode: TravelMode[this.travelMode],
      });
      renderer.setDirections(result);
    } catch {
      this.errorMessage = `Directions to ${place.name} could not be calculated.`;
    }
  }
  distance(value: number): string {
    return value < 1000 ? `${value} m` : `${(value / 1000).toFixed(1)} km`;
  }
  categoryLabel(category: PlaceCategory): string {
    return this.categories.find((item) => item.value === category)?.label || 'Place';
  }

  private async initialize(): Promise<void> {
    if (!this.mapContainer || !this.address.trim()) return;
    this.loading = true;
    this.errorMessage = '';
    this.allPlaces = [];
    const apiKey = document
      .querySelector<HTMLMetaElement>('meta[name="google-maps-api-key"]')
      ?.content.trim();
    if (!apiKey) {
      this.loading = false;
      this.errorMessage =
        'Google Maps is not configured. Add a browser-restricted API key to the google-maps-api-key meta tag.';
      return;
    }
    try {
      setOptions({ key: apiKey, v: 'weekly' });
      const [{ Map }, { Geocoder }] = await Promise.all([
        importLibrary('maps') as Promise<google.maps.MapsLibrary>,
        importLibrary('geocoding') as Promise<google.maps.GeocodingLibrary>,
      ]);
      const geocode = await new Geocoder().geocode({ address: `${this.address}, Georgia` });
      const location = geocode.results[0]?.geometry.location;
      if (!location) throw new Error('Address not found');
      this.apartmentLocation = location;
      this.map = new Map(this.mapContainer.nativeElement, {
        center: location,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      this.apartmentMarker = new google.maps.Marker({
        map: this.map,
        position: location,
        title: this.apartmentTitle,
        label: { text: 'H', color: '#fff', fontWeight: '700' },
      });
      await this.findNearby();
    } catch {
      this.errorMessage =
        'Google Maps could not locate this apartment. Check the address and API configuration.';
    } finally {
      this.loading = false;
    }
  }
  private async findNearby(): Promise<void> {
    if (!this.apartmentLocation) return;
    this.searching = true;
    this.errorMessage = '';
    this.directionsRenderer?.setMap(null);
    this.selectedPlace = undefined;
    try {
      const { Place, SearchNearbyRankPreference, SearchByTextRankPreference } =
        (await importLibrary('places')) as google.maps.PlacesLibrary;
      const searches = [
        {
          includedTypes: ['primary_school'],
          maxResultCount: 20,
        },
        {
          includedTypes: ['secondary_school'],
          maxResultCount: 20,
        },
        {
          includedTypes: ['school'],
          maxResultCount: 20,
        },
        { includedPrimaryTypes: ['preschool'], maxResultCount: 5 },
        { includedPrimaryTypes: ['supermarket'], maxResultCount: 5 },
        { includedPrimaryTypes: ['hospital'], maxResultCount: 5 },
        { includedPrimaryTypes: ['transit_station'], maxResultCount: 5 },
      ];
      const responses = await Promise.all(
        searches.map((search) =>
          Place.searchNearby({
            fields: [
              'id',
              'displayName',
              'formattedAddress',
              'location',
              'primaryType',
              'types',
              'businessStatus',
            ],
            locationRestriction: { center: this.apartmentLocation!, radius: 10000 },
            ...search,
            rankPreference: SearchNearbyRankPreference.DISTANCE,
          }),
        ),
      );
      const uniquePlaces = new Map<string, google.maps.places.Place>();
      let schoolPlaces = responses
        .slice(0, 3)
        .flatMap((response) => response.places)
        .filter((place) => this.isEligibleSchool(place));
      if (schoolPlaces.length < 10) {
        const fallbackResponses = await Promise.all(
          ['საჯარო სკოლა', 'კერძო სკოლა', 'public school', 'private school', 'school'].map(
            (textQuery) =>
              Place.searchByText({
                textQuery,
                fields: [
                  'id',
                  'displayName',
                  'formattedAddress',
                  'location',
                  'primaryType',
                  'types',
                  'businessStatus',
                ],
                locationBias: { center: this.apartmentLocation!, radius: 10000 },
                maxResultCount: 20,
                rankPreference: SearchByTextRankPreference.DISTANCE,
              }),
          ),
        );
        schoolPlaces = [
          ...schoolPlaces,
          ...fallbackResponses.flatMap((response, index) =>
            response.places.filter((place) =>
              this.isEligibleSchool(place, index === 1 || index === 3),
            ),
          ),
        ];
      }
      schoolPlaces.forEach((place) => uniquePlaces.set(this.schoolDedupeKey(place), place));
      responses
        .slice(3)
        .flatMap((response) => response.places)
        .forEach((place) => uniquePlaces.set(place.id || crypto.randomUUID(), place));
      await this.applyPlaces([...uniquePlaces.values()], 'school');
    } catch {
      this.errorMessage =
        'Nearby places could not be loaded. Make sure Places API (New) is enabled.';
    } finally {
      this.searching = false;
    }
  }
  private async applyPlaces(
    results: google.maps.places.Place[],
    fallback: PlaceCategory,
  ): Promise<void> {
    if (!this.apartmentLocation || !this.map) return;
    this.allPlaces = results
      .flatMap((place) =>
        place.location
          ? [
              {
                id: place.id || crypto.randomUUID(),
                name: place.displayName || 'Nearby place',
                address: place.formattedAddress || '',
                category: this.normalizeCategory(place.primaryType, fallback),
                location: place.location,
                distanceMeters: this.calculateDistance(this.apartmentLocation!, place.location),
              },
            ]
          : [],
      )
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    await this.loadWalkingTimes();
    this.drawMarkers();
  }
  private drawMarkers(): void {
    this.clearPlaceMarkers();
    if (!this.map) return;
    const bounds = new google.maps.LatLngBounds();
    if (this.apartmentLocation) bounds.extend(this.apartmentLocation);
    this.places.forEach((place, index) => {
      const marker = new google.maps.Marker({
        map: this.map,
        position: place.location,
        title: `${place.name}${place.walkingMinutes ? ` · ${place.walkingMinutes} min walk` : ''}`,
        label: { text: String(index + 1), color: '#fff', fontSize: '11px', fontWeight: '700' },
      });
      marker.addListener('click', () => void this.showDirections(place));
      this.placeMarkers.push(marker);
      bounds.extend(place.location);
    });
    if (this.places.length) this.map.fitBounds(bounds, 70);
  }
  private async loadWalkingTimes(): Promise<void> {
    if (!this.apartmentLocation || !this.allPlaces.length) return;
    try {
      const { DistanceMatrixService, TravelMode } = (await importLibrary(
        'routes',
      )) as google.maps.RoutesLibrary;
      const elements: google.maps.DistanceMatrixResponseElement[] = [];
      for (let index = 0; index < this.allPlaces.length; index += 25) {
        const response = await new DistanceMatrixService().getDistanceMatrix({
          origins: [this.apartmentLocation],
          destinations: this.allPlaces.slice(index, index + 25).map((place) => place.location),
          travelMode: TravelMode.WALKING,
        });
        elements.push(...(response.rows[0]?.elements || []));
      }
      this.allPlaces = this.allPlaces.map((place, index) => ({
        ...place,
        walkingMinutes: elements[index]?.duration
          ? Math.max(1, Math.round(elements[index].duration.value / 60))
          : undefined,
      }));
      this.allPlaces = this.allPlaces.filter(
        (place) =>
          place.category !== 'school' ||
          (place.walkingMinutes !== undefined && place.walkingMinutes <= 20),
      );
    } catch {
      /* Straight-line distances remain visible when walking estimates are unavailable. */
    }
  }
  private clearPlaceMarkers(): void {
    this.placeMarkers.forEach((marker) => marker.setMap(null));
    this.placeMarkers = [];
  }
  private normalizeCategory(
    primaryType: string | null | undefined,
    fallback: PlaceCategory,
  ): PlaceCategory {
    if (
      primaryType === 'school' ||
      primaryType === 'primary_school' ||
      primaryType === 'secondary_school'
    ) {
      return 'school';
    }
    return (primaryType as PlaceCategory) || fallback;
  }
  private isEligibleSchool(place: google.maps.places.Place, privateSearchMatch = false): boolean {
    const name = place.displayName?.toLocaleLowerCase() || '';
    const excluded =
      place.types?.includes('driving_school') === true ||
      place.types?.includes('preschool') === true ||
      name.includes('ავტოსკოლ') ||
      name.includes('autoschool') ||
      name.includes('auto school') ||
      name.includes('driving school') ||
      name.includes('მართვის სკოლ') ||
      name.includes('автошкол') ||
      name.includes('ბაღი') ||
      name.includes('საბავშვო ბაღ') ||
      name.includes('ბაგა-ბაღ') ||
      name.includes('kindergarten') ||
      name.includes('kindergarden') ||
      name.includes('preschool') ||
      name.includes('pre-school') ||
      name.includes('nursery') ||
      name.includes('детский сад') ||
      name.includes('детсад') ||
      name.includes('language school') ||
      name.includes('ენების სკოლ') ||
      name.includes('dance school') ||
      name.includes('ცეკვის სკოლ') ||
      name.includes('music school') ||
      name.includes('სამუსიკო სკოლ') ||
      name.includes('art school') ||
      name.includes('სასწავლო ცენტ') ||
      name.includes('training center') ||
      name.includes('vocational') ||
      name.includes('პროფესიულ');
    if (excluded) return false;

    const hasSchoolName = name.includes('school') || name.includes('სკოლ') || name.includes('школ');
    const hasSchoolNumber = /(?:№|#)\s*\d+|\bn\s*\.?\s*\d+/iu.test(name);
    const isPrivateSchool =
      name.includes('კერძო სკოლ') ||
      name.includes('private school') ||
      name.includes('частная школа');
    const isSecondarySchool =
      name.includes('secondary school') ||
      name.includes('საშუალო სკოლ') ||
      name.includes('средняя школа');
    return (
      (privateSearchMatch && place.types?.includes('school') === true) ||
      (hasSchoolName && (hasSchoolNumber || isPrivateSchool || isSecondarySchool))
    );
  }
  private schoolDedupeKey(place: google.maps.places.Place): string {
    const normalizedName = (place.displayName || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[№#\s.,'"`’_-]+/gu, '');
    return `school:${normalizedName || place.id || crypto.randomUUID()}`;
  }
  private calculateDistance(a: google.maps.LatLng, b: google.maps.LatLng): number {
    const rad = (v: number) => (v * Math.PI) / 180,
      dLat = rad(b.lat() - a.lat()),
      dLng = rad(b.lng() - a.lng());
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat())) * Math.cos(rad(b.lat())) * Math.sin(dLng / 2) ** 2;
    return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  }
}
