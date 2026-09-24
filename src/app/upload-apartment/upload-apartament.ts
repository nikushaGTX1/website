import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApartmentService } from '../services/apartment.service';
import { CreateApartment } from '../models/apartment';
import { AuthService } from '../services/auth.service';
import { PendingApartment, PendingApartmentService } from '../services/pending-apartment.service';
import { ApiLocation, LocationSuggestion } from '../models/location';
import { LocationService } from '../services/location.service';
import {
  GoogleNearbyTimeService,
  NearbyWalkingTimes,
} from '../maps/services/google-nearby-time.service';
import { TranslationService } from '../services/translation.service';
import { AiPricingService } from '../services/ai-pricing.service';

type UploadForm = {
  realEstateType: string;
  dealType: string;
  buildingStatus: string;
  condition: string;
  location: string;
  street: string;
  streetNumber: string;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  cadastralCode: string;
  hideAddress: boolean;
  totalPrice: number | null;
  sqPrice: number | null;
  currency: '$' | 'GEL';
  exchangePossible: boolean;
  title: string;
  description: string;
  area: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  hasElevator: boolean;
  hasParking: boolean;
  parkingCondition: string;
  isQuietStreet: boolean;
  hasBalcony: boolean;
  hasBathtub: boolean;
  hasAirConditioning: boolean;
  hasDishwasher: boolean;
  isPetFriendly: boolean;
  hasHomeOfficeSpace: boolean;
  hasLargeKitchen: boolean;
  hasView: boolean;
  viewType: string;
  minimumRentalPeriod: string;
  availableFrom: string;
  maxOccupants: number | null;
  isFurnished: boolean;
  hasLargeLivingRoom: boolean;
  hasPlaygroundNearby: boolean;
  hasCoworkingNearby: boolean;
  hasSecurity: boolean;
  isModernBuilding: boolean;
  hasIsolatedBedrooms: boolean;
  isAwayFromNightlife: boolean;
  hasCompanyLease: boolean;
  apartmentStyle: string;
  imageUrl: string;
  imageUrls: string[];
  contactName: string;
  contactPhone: string;
  agentName: string;
  agentPhone: string;
};

type BooleanFeature =
  | 'hasElevator'
  | 'hasParking'
  | 'isQuietStreet'
  | 'hasBalcony'
  | 'hasBathtub'
  | 'hasAirConditioning'
  | 'hasDishwasher'
  | 'isPetFriendly'
  | 'hasHomeOfficeSpace'
  | 'hasLargeKitchen'
  | 'hasView'
  | 'isFurnished'
  | 'hasLargeLivingRoom'
  | 'hasPlaygroundNearby'
  | 'hasCoworkingNearby'
  | 'hasSecurity'
  | 'isModernBuilding'
  | 'hasIsolatedBedrooms'
  | 'isAwayFromNightlife'
  | 'hasCompanyLease';

type ListingPlan = 'basic' | 'exclusive';

interface ListingPlanOption {
  id: ListingPlan;
  title: string;
  icon: string;
  description: string;
  cta: string;
  popular?: boolean;
  benefits: string[];
}

interface PreparedImage {
  previewUrl: string;
  file: File;
}

type FolderListingData = Record<string, unknown>;

@Component({
  selector: 'app-upload-apartment',
  standalone: false,
  templateUrl: './upload-apartaments.html',
  styleUrl: './upload-apartment.css',
})
export class UploadApartment implements OnInit, OnDestroy {
  readonly maxImages = 15;
  readonly listingPlans: ListingPlanOption[] = [
    {
      id: 'exclusive',
      title: 'Velven Exclusive',
      icon: 'fa-regular fa-gem',
      description: 'Exclusive representation with stronger promotion and full showing support.',
      cta: 'Choose Exclusive',
      popular: true,
      benefits: [
        'Everything in Basic',
        'Exclusive representation',
        'Professional photography',
        'Premium marketing on all platforms',
        'Key management & showing service',
        'Tenant screening & verification',
        'One-time re-rental service',
      ],
    },
    {
      id: 'basic',
      title: 'Basic List',
      icon: 'fa-solid fa-house',
      description: 'A simple listing with agent support and essential closing help.',
      cta: 'Choose Basic',
      benefits: [
        'Property listing',
        'Agent service',
        'AI Property Match',
        'Client check & appointment confirmation',
        'Contract & legal service',
      ],
    },
  ];

  readonly steps = [
    'Property Status',
    'Location',
    'Price',
    'Features',
    'Description / Photos',
    'Contact Information',
  ];

  readonly realEstateTypes = [
    'Apartment',
    'Private house',
    'Country house',
    'Plot',
    'Commercial area',
    'Hotel',
  ];

  readonly dealTypes = ['For Sale', 'For Rent', 'Lease', 'Daily rent'];
  readonly buildingStatuses = ['Old building', 'New building', 'Under construction'];
  readonly conditions = [
    'Newly Renovated',
    'Old renovated',
    'Current renovation',
    'Repairing',
    'White frame',
    'Black frame',
    'Green frame',
    'White Plus',
  ];

  readonly featureOptions: Array<{ label: string; field: BooleanFeature; icon: string }> = [
    { label: 'Elevator', field: 'hasElevator', icon: 'fa-solid fa-elevator' },
    { label: 'Parking', field: 'hasParking', icon: 'fa-solid fa-square-parking' },
    { label: 'Quiet street', field: 'isQuietStreet', icon: 'fa-solid fa-volume-xmark' },
    { label: 'Balcony', field: 'hasBalcony', icon: 'fa-solid fa-building' },
    { label: 'Bathtub', field: 'hasBathtub', icon: 'fa-solid fa-bath' },
    { label: 'Air conditioning', field: 'hasAirConditioning', icon: 'fa-solid fa-snowflake' },
    { label: 'Dishwasher', field: 'hasDishwasher', icon: 'fa-solid fa-kitchen-set' },
    { label: 'Pet friendly', field: 'isPetFriendly', icon: 'fa-solid fa-paw' },
    { label: 'Home office', field: 'hasHomeOfficeSpace', icon: 'fa-solid fa-laptop' },
    { label: 'Large kitchen', field: 'hasLargeKitchen', icon: 'fa-solid fa-utensils' },
    { label: 'Scenic view', field: 'hasView', icon: 'fa-solid fa-panorama' },
    { label: 'Furnished', field: 'isFurnished', icon: 'fa-solid fa-couch' },
    { label: 'Large living room', field: 'hasLargeLivingRoom', icon: 'fa-solid fa-couch' },
    { label: 'Playground nearby', field: 'hasPlaygroundNearby', icon: 'fa-solid fa-child-reaching' },
    { label: 'Cafés / coworking nearby', field: 'hasCoworkingNearby', icon: 'fa-solid fa-mug-hot' },
    { label: 'Security or concierge', field: 'hasSecurity', icon: 'fa-solid fa-shield-halved' },
    { label: 'Modern building', field: 'isModernBuilding', icon: 'fa-solid fa-city' },
    { label: 'Isolated bedrooms', field: 'hasIsolatedBedrooms', icon: 'fa-solid fa-door-closed' },
    { label: 'Away from nightlife', field: 'isAwayFromNightlife', icon: 'fa-solid fa-moon' },
    { label: 'Company lease available', field: 'hasCompanyLease', icon: 'fa-solid fa-file-contract' },
  ];
  readonly parkingTypeOptions = [
    { label: 'Garage', value: 'Garage', points: 5 },
    { label: 'Private courtyard parking', value: 'PrivateCourtyard', points: 4 },
    { label: 'Courtyard with a barrier/gate', value: 'CourtyardWithBarrier', points: 3 },
    { label: 'Street parking', value: 'StreetParking', points: 2 },
    { label: 'Courtyard without a barrier/gate', value: 'CourtyardWithoutBarrier', points: 1 },
    { label: 'Parking is difficult', value: 'DifficultParking', points: 0 },
  ];

  readonly viewTypeOptions = ['City View', 'Nature View', 'No View'];

  readonly minimumRentalPeriodOptions = ['Minimum 6 months', 'Minimum 12 months'];

  form: UploadForm = {
    realEstateType: 'Apartment',
    dealType: 'For Sale',
    buildingStatus: 'Old building',
    condition: 'Newly Renovated',
    location: '',
    street: '',
    streetNumber: '',
    propertyLatitude: null,
    propertyLongitude: null,
    cadastralCode: '',
    hideAddress: false,
    totalPrice: null,
    sqPrice: null,
    currency: '$',
    exchangePossible: false,
    title: '',
    description: '',
    area: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    floor: null,
    totalFloors: null,
    hasElevator: false,
    hasParking: false,
    parkingCondition: '',
    isQuietStreet: false,
    hasBalcony: false,
    hasBathtub: false,
    hasAirConditioning: false,
    hasDishwasher: false,
    isPetFriendly: false,
    hasHomeOfficeSpace: false,
    hasLargeKitchen: false,
    hasView: false,
    viewType: '',
    minimumRentalPeriod: '',
    availableFrom: '',
    maxOccupants: null,
    isFurnished: false,
    hasLargeLivingRoom: false,
    hasPlaygroundNearby: false,
    hasCoworkingNearby: false,
    hasSecurity: false,
    isModernBuilding: false,
    hasIsolatedBedrooms: false,
    isAwayFromNightlife: false,
    hasCompanyLease: false,
    apartmentStyle: 'Modern',
    imageUrl: '',
    imageUrls: [],
    contactName: '',
    contactPhone: '',
    agentName: '',
    agentPhone: '',
  };

  loading = false;
  selectedListingPlan: ListingPlan | null = 'exclusive';
  activeStep = 0;
  draftSaved = false;
  successMessage = '';
  showSuccessModal = false;
  successModalEdited = false;
  editId: number | null = null;
  editPendingId: string | null = null;
  editLoading = false;
  private editOriginalMeta = '';
  successModalPending = false;
  errorMessage = '';
  userMessages: PendingApartment[] = [];
  pendingDebug = '';
  imageUploadMessage = '';
  folderImportMessage = '';
  folderImportError = '';
  importingFolder = false;
  selectedImages: File[] = [];
  draggedImageIndex: number | null = null;
  imageDropIndex: number | null = null;
  locationEntries: ApiLocation[] = [];
  locationLoading = false;
  locationError = false;
  locationPicker: 'area' | 'street' | null = null;
  selectedDistrictValue = '';
  selectedStreetValue = '';
  selectedStreetId: number | null = null;
  duplicateChecking = false;
  duplicateMatch: import('../models/apartment').Apartment | null = null;
  duplicateDismissedForKey = '';
  private readonly dismissedNotificationsKey = 'dismissedApartmentApprovalNotifications';
  private readonly subscriptions = new Subscription();
  private dismissedNotificationIds = new Set<string>();

  constructor(
    private apartmentService: ApartmentService,
    private authService: AuthService,
    private pendingService: PendingApartmentService,
    private locationService: LocationService,
    private nearbyTimeService: GoogleNearbyTimeService,
    private translationService: TranslationService,
    private aiPricingService: AiPricingService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.dismissedNotificationIds = this.readDismissedNotificationIds();
    this.subscriptions.add(
      this.pendingService.pendingApartments$.subscribe(() => this.refreshUserMessages()),
    );
    this.pendingDebug = this.pendingService.getStorageDebug();
  }

  get isEditMode(): boolean {
    return this.editId !== null || this.editPendingId !== null;
  }

  ngOnInit(): void {
    const currentUser = this.authService.currentUser;
    this.form.agentName = currentUser?.fullName || currentUser?.userName || '';
    this.form.agentPhone = currentUser?.phoneNumber || '';
    this.pendingService.refresh();
    this.startEditFromRoute();
    this.locationLoading = true;
    this.locationService.getLocations().subscribe({
      next: (locations) => {
        this.locationEntries = locations;
        this.locationLoading = false;
      },
      error: () => {
        this.locationLoading = false;
        this.locationError = true;
      },
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Editing reuses this exact form: /upload-apartment?edit=ID or ?pending=ID. */
  private startEditFromRoute(): void {
    const params = this.route.snapshot.queryParamMap;
    const pendingId = params.get('pending');
    const editId = Number(params.get('edit'));
    if (pendingId) {
      const request = this.pendingService.getAll().find((item) => item.id === pendingId);
      if (request) {
        this.editPendingId = pendingId;
        this.applyExistingListing(request.apartment);
      }
      return;
    }
    if (Number.isFinite(editId) && editId > 0) {
      this.editId = editId;
      this.editLoading = true;
      this.apartmentService.getApartment(editId).subscribe({
        next: (apartment) => {
          this.editLoading = false;
          this.applyExistingListing(apartment);
          this.cdr.detectChanges();
        },
        error: () => {
          this.editLoading = false;
          this.editId = null;
          this.errorMessage = 'Could not load this listing for editing.';
        },
      });
    }
  }

  private metaTag(meta: string, name: string): string {
    const prefix = name.toLowerCase() + ':';
    const match = meta.split('|').map((part) => part.trim()).find((part) => part.toLowerCase().startsWith(prefix));
    return match ? match.slice(prefix.length).trim() : '';
  }

  private applyExistingListing(source: Partial<import('../models/apartment').Apartment & CreateApartment>): void {
    const description = source.description || '';
    const splitAt = description.lastIndexOf('\n\n');
    const tail = splitAt >= 0 ? description.slice(splitAt + 2) : '';
    const hasMeta = tail.startsWith('Listing plan:');
    const meta = hasMeta ? tail : '';
    this.editOriginalMeta = meta;
    const tag = (name: string): string => this.metaTag(meta, name);
    const num = (value: unknown): number | null => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const f = this.form;
    f.description = hasMeta ? description.slice(0, splitAt) : description;
    f.title = source.title || f.title;
    f.totalPrice = num(source.price);
    f.sqPrice = num(tag('Sq. price'));
    f.currency = tag('Currency').toUpperCase() === 'GEL' ? 'GEL' : '$';
    f.exchangePossible = /Exchange possible/i.test(meta);
    f.realEstateType = tag('Type') || f.realEstateType;
    f.dealType = tag('Deal') || f.dealType;
    f.buildingStatus = tag('Status') || f.buildingStatus;
    f.condition = tag('Condition') || source.condition || f.condition;
    this.selectedListingPlan = /Basic/i.test(tag('Listing plan')) ? 'basic' : 'exclusive';
    f.area = num(source.sizeSquareMeters) ?? num(tag('Area').replace(/[^0-9.]/g, ''));
    f.rooms = num(source.rooms) ?? num(tag('Rooms'));
    f.bedrooms = source.bedrooms ?? num(tag('Bedrooms'));
    f.bathrooms = source.bathrooms ?? num(tag('Bathrooms'));
    f.floor = num(source.floor);
    f.totalFloors = num(source.totalFloors);
    const flags: BooleanFeature[] = [
      'hasElevator', 'hasParking', 'isQuietStreet', 'hasBalcony', 'hasBathtub', 'hasAirConditioning',
      'hasDishwasher', 'isPetFriendly', 'hasHomeOfficeSpace', 'hasLargeKitchen', 'hasView', 'isFurnished',
    ];
    for (const flag of flags) f[flag] = !!(source as Record<string, unknown>)[flag];
    const tagged: BooleanFeature[] = [
      'hasLargeLivingRoom', 'hasPlaygroundNearby', 'hasCoworkingNearby', 'hasSecurity',
      'isModernBuilding', 'hasIsolatedBedrooms', 'isAwayFromNightlife', 'hasCompanyLease',
    ];
    for (const option of this.featureOptions) {
      if (tagged.includes(option.field)) f[option.field] = meta.includes(option.label + ': Yes');
    }
    const parkingLabel = tag('Parking type');
    f.parkingCondition = source.parkingCondition ||
      this.parkingTypeOptions.find((o) => o.label === parkingLabel)?.value || '';
    f.viewType = source.viewType || tag('View type');
    f.minimumRentalPeriod = source.minimumRentalPeriod || tag('Minimum rental');
    f.availableFrom = source.availableFrom || '';
    f.maxOccupants = source.maxOccupants ?? null;
    f.apartmentStyle = source.apartmentStyle || f.apartmentStyle;
    f.cadastralCode = tag('Cadastral');
    const district = source.district || tag('District');
    const street = source.street || tag('Street');
    this.selectedDistrictValue = district;
    f.location = district;
    this.selectedStreetValue = street;
    f.street = street;
    this.selectedStreetId = source.streetId || num(tag('Street ID'));
    f.streetNumber = source.buildingNumber || tag('Building');
    f.propertyLatitude = num(source.propertyLatitude ?? source.latitude);
    f.propertyLongitude = num(source.propertyLongitude ?? source.longitude);
    f.contactName = source.ownerName || '';
    f.contactPhone = source.ownerPhoneNumber || '';
    f.agentName = source.agentName || f.agentName;
    f.agentPhone = source.agentPhoneNumber || source.phoneNumber || f.agentPhone;
    const images = source.imageUrls?.length
      ? source.imageUrls
      : (source.images || []).map((image) => image.url || '').filter(Boolean);
    f.imageUrls = images.length ? [...images] : source.imageUrl ? [source.imageUrl] : [];
    f.imageUrl = f.imageUrls[0] || '';
    this.activeStep = 0;
  }

  dismissNotification(message: PendingApartment): void {
    this.dismissedNotificationIds.add(message.id);
    localStorage.setItem(
      this.dismissedNotificationsKey,
      JSON.stringify([...this.dismissedNotificationIds]),
    );
    this.refreshUserMessages();
  }

  identifyNotification(_: number, message: PendingApartment): string {
    return message.id;
  }

  private refreshUserMessages(): void {
    this.userMessages = this.pendingService
      .getForUser(this.authService.currentUser)
      .filter(
        (item) =>
          item.status === 'declined' &&
          !this.dismissedNotificationIds.has(item.id),
      );
    this.pendingDebug = this.pendingService.getStorageDebug();
  }

  private readDismissedNotificationIds(): Set<string> {
    try {
      const ids = JSON.parse(localStorage.getItem(this.dismissedNotificationsKey) || '[]');
      return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
    } catch {
      return new Set<string>();
    }
  }

  @HostListener('document:click')
  closeLocationPicker(): void {
    this.locationPicker = null;
  }

  get uploadAreaSuggestions(): LocationSuggestion[] {
    const query = this.form.location.trim().toLowerCase();
    const language = this.translationService.language$.value;
    return this.locationEntries
      .filter((entry) => entry.city === 'Tbilisi')
      .filter((entry) =>
        !query ||
        entry.district.toLowerCase().includes(query) ||
        this.locationService.districtName(entry, language).toLowerCase().includes(query),
      )
      .slice(0, 10)
      .map((entry) => ({
        id: entry.id,
        label: this.locationService.districtName(entry, language),
        value: entry.district,
        type: 'Area',
        city: this.locationService.cityName(entry, language),
      }));
  }

  get uploadStreetSuggestions(): LocationSuggestion[] {
    const query = this.form.street.trim().toLowerCase();
    const language = this.translationService.language$.value;
    if (!this.selectedDistrictValue && query.length < 2) return [];
    const suggestions: LocationSuggestion[] = [];
    const seen = new Set<string>();

    const selectedArea = this.locationEntries.find((item) =>
      item.city === 'Tbilisi' && item.district === this.selectedDistrictValue,
    );
    const citywideCatalog = this.locationEntries.find((item) =>
      item.city === 'Tbilisi' && item.district === 'All Tbilisi',
    );

    for (const entry of [selectedArea, citywideCatalog].filter(
      (item): item is ApiLocation => !!item,
    )) {
      for (const street of this.locationService.streetNames(entry, language)) {
        const key = street.value.trim().toLowerCase();
        if (
          !seen.has(key) &&
          (!query ||
            street.value.toLowerCase().includes(query) ||
            street.label.toLowerCase().includes(query))
        ) {
          seen.add(key);
          suggestions.push({
            id: street.id,
            label: street.label,
            value: street.value,
            type: 'Street',
            district: selectedArea
              ? this.locationService.districtName(selectedArea, language)
              : this.form.location,
            districtValue: this.selectedDistrictValue,
            region: selectedArea?.region,
          });
          if (suggestions.length === 10) return suggestions;
        }
      }
    }
    return suggestions;
  }

  openLocationPicker(type: 'area' | 'street'): void {
    this.locationPicker = type;
  }

  onAreaInput(): void {
    this.clearPropertyPoint();
    this.selectedDistrictValue = '';
    this.openLocationPicker('area');
  }

  onStreetInput(): void {
    this.clearPropertyPoint();
    this.selectedStreetValue = '';
    this.selectedStreetId = null;
    this.openLocationPicker('street');
  }

  selectUploadArea(suggestion: LocationSuggestion, event?: Event): void {
    // pointerdown (not click) so this runs before the input's blur closes
    // the suggestion list — otherwise the first tap only dismisses the
    // list and the user has to click the same suggestion a second time.
    event?.preventDefault();
    event?.stopPropagation();
    this.clearPropertyPoint();
    this.form.location = suggestion.label;
    this.selectedDistrictValue = suggestion.value || suggestion.label;
    this.form.street = '';
    this.selectedStreetValue = '';
    this.selectedStreetId = null;
    this.locationPicker = null;
    this.clearDuplicateDismissal();
    this.checkDuplicates();
  }

  selectUploadStreet(suggestion: LocationSuggestion, event?: Event): void {
    // pointerdown (not click) — see selectUploadArea for why.
    event?.preventDefault();
    event?.stopPropagation();
    this.clearPropertyPoint();
    this.form.street = suggestion.label;
    this.selectedStreetValue = suggestion.value || suggestion.label;
    this.selectedStreetId = suggestion.id || null;
    this.selectedDistrictValue = suggestion.districtValue || '';
    this.form.location = suggestion.district || suggestion.districtValue || '';
    this.locationPicker = null;
    this.clearDuplicateDismissal();
    this.checkDuplicates();
  }

  clearPropertyPoint(): void {
    this.form.propertyLatitude = null;
    this.form.propertyLongitude = null;
  }

  uploadLocationText(english: string, georgian: string, russian?: string): string {
    const language = this.translationService.language$.value;
    if (language === 'ka') return georgian;
    if (language === 'ru') return russian ?? this.translationService.translate(english, 'ru');
    return english;
  }

  select(field: keyof UploadForm, value: string): void {
    (this.form[field] as string) = value;
  }

  chooseListingPlan(plan: ListingPlan): void {
    this.selectedListingPlan = plan;
    this.successMessage = '';
    this.errorMessage = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openStep(index: number): void {
    this.activeStep = index;
    requestAnimationFrame(() => {
      document.getElementById(`listing-step-${index}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }

  get completionPercentage(): number {
    return Math.round((this.steps.filter((_, index) => this.isStepComplete(index)).length / this.steps.length) * 100);
  }

  saveDraft(): void {
    try {
      const draft = { ...this.form, imageUrl: '', imageUrls: [] };
      localStorage.setItem('velvenListingDraft', JSON.stringify(draft));
      this.draftSaved = true;
      window.setTimeout(() => (this.draftSaved = false), 2200);
    } catch {
      this.errorMessage = 'This browser could not save the draft locally.';
    }
  }

  changeListingPlan(): void {
    this.selectedListingPlan = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  get selectedListingPlanOption(): ListingPlanOption | undefined {
    return this.listingPlans.find((plan) => plan.id === this.selectedListingPlan);
  }

  get isExclusivePlan(): boolean {
    return this.selectedListingPlan === 'exclusive';
  }

  setCurrency(currency: '$' | 'GEL'): void {
    this.form.currency = currency;
  }

  toggle(field: 'hideAddress' | 'exchangePossible' | BooleanFeature): void {
    this.form[field] = !this.form[field];
    if (field === 'hasParking' && !this.form.hasParking) this.form.parkingCondition = '';
  }

  parkingPointsFor(value: string): number {
    return this.parkingTypeOptions.find((option) => option.value === value)?.points ?? 0;
  }

  selectParkingType(value: string): void {
    this.form.parkingCondition = value;
    this.form.hasParking = this.parkingPointsFor(value) > 0;
    this.clearDuplicateDismissal();
  }

  selectViewType(value: string): void {
    this.form.viewType = value;
    this.form.hasView = value === 'City View' || value === 'Nature View';
  }

  selectRentalPeriod(value: string): void {
    this.form.minimumRentalPeriod = this.form.minimumRentalPeriod === value ? '' : value;
  }

  get isRentalDeal(): boolean {
    return this.form.dealType !== 'For Sale';
  }

  get duplicateSignature(): string {
    return JSON.stringify([
      this.selectedDistrictValue,
      this.selectedStreetId ?? this.selectedStreetValue,
      (this.form.streetNumber || '').trim().toLowerCase(),
      Number(this.form.area || 0),
      Number(this.form.totalPrice || 0),
      Number(this.form.rooms || 0),
      Number(this.form.bedrooms || 0),
      Number(this.form.floor || 0),
    ]);
  }

  clearDuplicateDismissal(): void {
    this.duplicateDismissedForKey = '';
  }

  /**
   * Clamps a numeric property field to a sensible, non-negative range,
   * rounding to a whole number where the field can't be fractional
   * (rooms/bedrooms/bathrooms/floors). Runs on every change so an
   * out-of-range or malformed value (typed past the min/max spinner,
   * or pasted in) can never be saved, without capping the range so low
   * that a legitimate large/luxury property gets rejected.
   */
  clampNumericField(
    field: 'area' | 'rooms' | 'bedrooms' | 'bathrooms' | 'floor' | 'totalFloors',
    options: { min: number; max: number; integer: boolean },
  ): void {
    const raw = this.form[field];
    if (raw === null || raw === undefined || Number.isNaN(raw)) return;
    let value = Number(raw);
    if (options.integer) value = Math.round(value);
    value = Math.min(options.max, Math.max(options.min, value));
    if (value !== raw) this.form[field] = value;
  }

  aiPriceLoading = false;
  aiPriceError = '';
  aiSuggestedPrice: number | null = null;

  get canCalculateAiPrice(): boolean {
    return !this.aiPriceLoading && !!this.form.area && this.form.area > 0 && !!this.form.location;
  }

  calculateAiPrice(): void {
    if (!this.canCalculateAiPrice) {
      this.aiPriceError = 'Add the living area and location before calculating a price.';
      return;
    }
    this.aiPriceLoading = true;
    this.aiPriceError = '';
    this.aiSuggestedPrice = null;
    this.aiPricingService
      .estimate({
        RealEstateType: this.form.realEstateType,
        DealType: this.form.dealType,
        Condition: this.form.condition,
        Area: this.form.area ?? 0,
        Rooms: this.form.rooms,
        Bedrooms: this.form.bedrooms,
        Bathrooms: this.form.bathrooms,
        Floor: this.form.floor,
        TotalFloors: this.form.totalFloors,
        District: this.form.location,
        Street: this.form.street,
      })
      .subscribe({
        next: (result) => {
          this.aiSuggestedPrice = result.price;
          this.aiPriceLoading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.aiPriceLoading = false;
          this.aiPriceError =
            error.status === 404
              ? 'AI price calculation is not available right now. Please enter a price manually.'
              : 'Could not calculate a price. Please try again.';
        },
      });
  }

  applyAiSuggestedPrice(): void {
    if (this.aiSuggestedPrice == null) return;
    this.form.totalPrice = Math.round(this.aiSuggestedPrice);
    this.aiSuggestedPrice = null;
    this.clearDuplicateDismissal();
    this.checkDuplicates();
  }

  get floorExceedsTotalFloors(): boolean {
    return (
      this.form.floor != null &&
      this.form.totalFloors != null &&
      this.form.floor > this.form.totalFloors
    );
  }

  get duplicateOwnerName(): string {
    const match = this.duplicateMatch;
    if (!match) return '';
    return (
      match.ownerName?.trim() ||
      match.agentName?.trim() ||
      match.uploadedByName?.trim() ||
      match.createdByEmail?.trim() ||
      match.uploadedByEmail?.trim() ||
      'the original agent'
    );
  }

  checkDuplicates(): void {
    if (this.isEditMode) {
      this.duplicateMatch = null;
      return;
    }
    if (!this.selectedDistrictValue || !this.selectedStreetId || !this.form.area || !this.form.totalPrice) {
      this.duplicateMatch = null;
      return;
    }
    if (this.duplicateDismissedForKey === this.duplicateSignature) return;
    this.duplicateChecking = true;
    this.apartmentService.getApartments().subscribe({
      next: (apartments) => {
        this.duplicateChecking = false;
        this.duplicateMatch = this.findDuplicate(apartments);
      },
      error: () => {
        this.duplicateChecking = false;
      },
    });
  }

  dismissDuplicate(): void {
    this.duplicateDismissedForKey = this.duplicateSignature;
    this.duplicateMatch = null;
  }

  private normalizeText(value: string | null | undefined): string {
    return (value || '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
  }

  private toUsdPrice(): number {
    const price = Number(this.form.totalPrice || 0);
    if (!price) return 0;
    return this.form.currency === 'GEL' ? price / 2.7 : price;
  }

  private findDuplicate(apartments: import('../models/apartment').Apartment[]): import('../models/apartment').Apartment | null {
    const district = this.normalizeText(this.selectedDistrictValue);
    const streetId = this.selectedStreetId;
    const streetName = this.normalizeText(this.selectedStreetValue || this.form.street);
    const building = this.normalizeText(this.form.streetNumber);
    const area = Number(this.form.area || 0);
    const priceUsd = this.toUsdPrice();
    const rooms = Number(this.form.rooms || 0);
    const bedrooms = Number(this.form.bedrooms || 0);
    const floor = Number(this.form.floor || 0);

    let best: import('../models/apartment').Apartment | null = null;
    let bestScore = 0;

    for (const apartment of apartments) {
      let score = 0;
      // Street must match by id when available, otherwise by normalized name.
      const sameStreet = streetId != null && apartment.streetId != null
        ? apartment.streetId === streetId
        : streetName && this.normalizeText(apartment.street) === streetName;
      if (!sameStreet) continue;
      if (district && this.normalizeText(apartment.district) !== district) continue;

      // Building number is a strong signal when both sides provide it.
      const apartmentBuilding = this.normalizeText(apartment.buildingNumber);
      if (building && apartmentBuilding) {
        if (building !== apartmentBuilding) continue;
        score += 2;
      }

      // Area (square meters) must be close — this is a required criterion.
      const apartmentArea = Number(apartment.sizeSquareMeters || 0);
      if (!area || !apartmentArea || Math.abs(apartmentArea - area) > 1) continue;
      score += 2;

      // Price must be close (converted to USD).
      const apartmentPrice = Number(apartment.price || 0);
      if (!priceUsd || !apartmentPrice) continue;
      const priceDiff = Math.abs(apartmentPrice - priceUsd) / Math.max(apartmentPrice, priceUsd);
      if (priceDiff > 0.03 && Math.abs(apartmentPrice - priceUsd) > 100) continue;
      score += 2;

      if (rooms && Number(apartment.rooms || 0) === rooms) score += 1;
      if (bedrooms && Number(apartment.bedrooms || 0) === bedrooms) score += 1;
      if (floor && Number(apartment.floor || 0) === floor) score += 1;

      // Coordinates very close to each other add confidence.
      const lat = Number(apartment.propertyLatitude ?? apartment.latitude);
      const lng = Number(apartment.propertyLongitude ?? apartment.longitude);
      if (
        Number.isFinite(Number(this.form.propertyLatitude)) &&
        Number.isFinite(Number(this.form.propertyLongitude)) &&
        Number.isFinite(lat) && Number.isFinite(lng)
      ) {
        const distance = Math.hypot(lat - Number(this.form.propertyLatitude), lng - Number(this.form.propertyLongitude));
        if (distance < 0.0005) score += 2;
      }

      if (score > bestScore && score >= 6) {
        bestScore = score;
        best = apartment;
      }
    }

    return best;
  }

  get previewTitle(): string {
    return this.form.title.trim() || `${this.form.realEstateType} ${this.form.dealType.toLowerCase()}`;
  }

  get previewLocation(): string {
    return this.form.location || 'Location';
  }

  get locationPreviewAddress(): string {
    return [this.form.street, this.form.streetNumber, this.form.location, 'Tbilisi']
      .filter((part) => part.trim())
      .join(', ');
  }

  get previewPrice(): string {
    if (!this.form.totalPrice) {
      return 'Price';
    }

    return `${this.form.currency} ${this.form.totalPrice.toLocaleString()}`;
  }

  get primaryImage(): string {
    return this.form.imageUrls[0] || this.form.imageUrl;
  }

  get uploadedImageCount(): number {
    return this.form.imageUrls.length;
  }

  get currentStepIndex(): number {
    const firstIncomplete = this.steps.findIndex((_, index) => !this.isStepComplete(index));
    return firstIncomplete === -1 ? this.steps.length - 1 : firstIncomplete;
  }

  isStepComplete(index: number): boolean {
    switch (index) {
      case 0:
        return !!(this.form.realEstateType && this.form.dealType && this.form.buildingStatus && this.form.condition);
      case 1:
        return !!(
          this.selectedDistrictValue &&
          this.selectedStreetId &&
          this.form.streetNumber.trim()
        );
      case 2:
        return !!this.form.totalPrice;
      case 3:
        return !!(
          (this.form.area || this.form.rooms || this.form.bedrooms) &&
          (!this.form.hasParking || this.form.parkingCondition)
        );
      case 4:
        return !!(this.form.title.trim() && this.form.description.trim() && this.uploadedImageCount);
      case 5:
        return !!(this.form.contactName.trim() && this.form.contactPhone.trim() && this.form.agentName.trim() && this.form.agentPhone.trim());
      default:
        return false;
    }
  }

  async onImagesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    this.imageUploadMessage = '';

    if (!files.length) {
      return;
    }

    const remainingSlots = this.maxImages - this.form.imageUrls.length;
    const selectedFiles = files.slice(0, Math.max(remainingSlots, 0));

    if (files.length > remainingSlots) {
      this.imageUploadMessage = `Only ${this.maxImages} photos can be uploaded. Extra files were skipped.`;
    }

    const validFiles = selectedFiles.filter((file) => file.type.startsWith('image/'));
    if (validFiles.length !== selectedFiles.length) {
      this.imageUploadMessage = 'Only image files are supported. Other files were skipped.';
    }

    const preparedImages = await Promise.all(
      validFiles.map((file) => this.prepareImage(file).catch(() => null)),
    );
    const successfulImages = preparedImages.filter(
      (image): image is PreparedImage => image !== null,
    );

    if (successfulImages.length !== validFiles.length) {
      this.imageUploadMessage = 'One or more selected images could not be processed.';
    }

    this.form.imageUrls = [
      ...this.form.imageUrls,
      ...successfulImages.map((image) => image.previewUrl),
    ].slice(0, this.maxImages);
    this.selectedImages = [
      ...this.selectedImages,
      ...successfulImages.map((image) => image.file),
    ].slice(0, this.maxImages);

    this.form.imageUrl = this.form.imageUrls[0] || '';
    input.value = '';
  }

  removeImage(index: number): void {
    this.form.imageUrls = this.form.imageUrls.filter((_, imageIndex) => imageIndex !== index);
    this.selectedImages = this.selectedImages.filter((_, imageIndex) => imageIndex !== index);
    this.form.imageUrl = this.form.imageUrls[0] || '';
  }

  startImageDrag(index: number, event: DragEvent): void {
    this.draggedImageIndex = index;
    this.imageDropIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  hoverImageDrop(index: number, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.imageDropIndex = index;
  }

  dropImageAt(index: number, event: DragEvent): void {
    event.preventDefault();
    const source = this.draggedImageIndex;
    if (source !== null && source !== index) this.moveImage(source, index);
    this.finishImageDrag();
  }

  finishImageDrag(): void {
    this.draggedImageIndex = null;
    this.imageDropIndex = null;
  }

  moveImage(source: number, target: number): void {
    if (source === target || source < 0 || target < 0 || source >= this.form.imageUrls.length || target >= this.form.imageUrls.length) return;
    const previews = [...this.form.imageUrls];
    const files = [...this.selectedImages];
    const [preview] = previews.splice(source, 1);
    const [file] = files.splice(source, 1);
    previews.splice(target, 0, preview);
    if (file) files.splice(target, 0, file);
    this.form.imageUrls = previews;
    this.selectedImages = files;
    this.form.imageUrl = previews[0] || '';
  }

  makeCoverImage(index: number): void {
    this.moveImage(index, 0);
  }

  async onListingFolderSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.folderImportMessage = '';
    this.folderImportError = '';
    if (!files.length) return;

    const dataFile = files.find((file) => /(^|\/)data\.json$/i.test(file.webkitRelativePath || file.name));
    if (!dataFile) {
      this.folderImportError = 'The selected folder does not contain data.json.';
      input.value = '';
      return;
    }

    this.importingFolder = true;
    try {
      const parsed = JSON.parse(await dataFile.text()) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('data.json must contain one listing object.');
      this.applyFolderListingData(parsed as FolderListingData);
      this.resolveImportedLocation();

      const imageFiles = files
        .filter((file) => /(^|\/)images\//i.test((file.webkitRelativePath || file.name).replace(/\\/g, '/')) && file.type.startsWith('image/'))
        .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }))
        .slice(0, this.maxImages);
      const prepared = await Promise.all(imageFiles.map((file) => this.prepareImage(file).catch(() => null)));
      const images = prepared.filter((item): item is PreparedImage => item !== null);
      this.form.imageUrls = images.map((item) => item.previewUrl);
      this.selectedImages = images.map((item) => item.file);
      this.form.imageUrl = this.form.imageUrls[0] || '';
      const skipped = imageFiles.length - images.length;
      this.folderImportMessage = `Imported data.json and ${images.length} photo${images.length === 1 ? '' : 's'}.${skipped ? ` ${skipped} could not be processed.` : ''}`;
      this.activeStep = 0;
    } catch (error) {
      this.folderImportError = error instanceof Error ? `Could not import folder: ${error.message}` : 'Could not import folder.';
    } finally {
      this.importingFolder = false;
      input.value = '';
    }
  }

  private applyFolderListingData(data: FolderListingData): void {
    const text = (key: string): string => data[key] == null ? '' : String(data[key]).trim();
    const number = (key: string): number | null => {
      const raw = data[key];
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
      const parsed = Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
      return String(raw ?? '').trim() && Number.isFinite(parsed) ? parsed : null;
    };
    const enabled = (key: string): boolean => ['true', 'yes', 'კი', 'არის', '1'].includes(text(key).toLowerCase());
    const propertyTypes: Record<string, string> = { 'ბინა': 'Apartment', 'კერძო სახლი': 'Private house', 'აგარაკი': 'Country house', 'მიწის ნაკვეთი': 'Plot', 'კომერციული ფართი': 'Commercial area', 'სასტუმრო': 'Hotel' };
    const dealTypes: Record<string, string> = { 'იყიდება': 'For Sale', 'ქირავდება': 'For Rent', 'გირავდება': 'Lease', 'ქირავდება დღიურად': 'Daily rent' };
    const statuses: Record<string, string> = { 'ძველი აშენებული': 'Old building', 'ახალი აშენებული': 'New building', 'მშენებარე': 'Under construction' };
    const conditions: Record<string, string> = { 'ახალი რემონტით': 'Newly Renovated', 'ძველი რემონტით': 'Old renovated', 'მიმდინარე რემონტი': 'Current renovation', 'სარემონტო': 'Repairing', 'თეთრი კარკასი': 'White frame', 'შავი კარკასი': 'Black frame', 'მწვანე კარკასი': 'Green frame', 'თეთრი პლუსი': 'White Plus' };
    const deal = text('გაყიდვა/ქირა') || text('განცხადების სახეობა');
    const condition = text('რემონტი') || text('მდგომარეობა');

    this.form.realEstateType = propertyTypes[text('ქონების ტიპი')] || this.form.realEstateType;
    this.form.dealType = dealTypes[deal] || this.form.dealType;
    this.form.buildingStatus = statuses[text('სტატუსი')] || this.form.buildingStatus;
    this.form.condition = conditions[condition] || this.form.condition;
    this.form.location = text('უბანი');
    this.form.street = text('მისამართი').replace(/\s+(ქ\.?|ქუჩა)$/i, '').trim();
    this.form.totalPrice = number('ფასი');
    this.form.sqPrice = number('ფასი / მ²');
    this.form.currency = text('ვალუტა').toUpperCase() === 'GEL' ? 'GEL' : '$';
    this.form.area = number('ფართობი (მ²)') ?? number('კვადრატულობა');
    this.form.rooms = number('ოთახები');
    this.form.bedrooms = number('საძინებელი');
    this.form.floor = number('სართული');
    this.form.totalFloors = number('სართულიანობა');
    this.form.description = text('კომენტარი');
    // Scraped listing JSON contains the source contact, which is always the
    // property owner for this import workflow—even when a legacy scraper used
    // an "agent"-labelled key. Never use these values for the website agent.
    this.form.contactName = text('მესაკუთრის სახელი') || text('აგენტის სახელი');
    this.form.contactPhone =
      text('მესაკუთრის ნომერი') ||
      text('ტელეფონის ნომერი') ||
      text('აგენტის ნომერი') ||
      text('აგენტის ტელეფონის ნომერი');
    this.form.hasElevator = enabled('ლიფტი');
    this.form.hasParking = enabled('პარკინგი');
    this.form.hasBalcony = enabled('აივანი');
    this.form.isFurnished = /ავეჯ|მოწყობილ/i.test(`${text('მდგომარეობა')} ${this.form.description}`);
    this.form.title = [this.form.realEstateType, this.form.dealType, this.form.location].filter(Boolean).join(' · ');
  }

  private resolveImportedLocation(): void {
    const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+(ქ\.?|ქუჩა)$/i, '').replace(/[^a-z0-9\u10a0-\u10ff]/g, '');
    const districtQuery = normalize(this.form.location);
    const district = this.locationEntries.find((entry) => normalize(entry.district) === districtQuery || normalize(this.locationService.districtName(entry, 'ka')) === districtQuery);
    this.selectedDistrictValue = district?.district || '';
    if (district) this.form.location = this.locationService.districtName(district, 'ka');
    const streetQuery = normalize(this.form.street);
    const street = district ? this.locationService.streetNames(district, 'ka').find((item) => normalize(item.label) === streetQuery || normalize(item.value) === streetQuery) : undefined;
    this.selectedStreetId = street?.id || null;
    this.selectedStreetValue = street?.value || '';
    if (street) this.form.street = street.label;
  }

  async publish(): Promise<void> {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.form.totalPrice || !this.form.contactName.trim() || !this.form.contactPhone.trim() || !this.form.agentName.trim() || !this.form.agentPhone.trim()) {
      this.errorMessage = 'Please fill in the price and all owner and agent contact fields before publishing.';
      return;
    }

    if (!this.selectedDistrictValue) {
      this.errorMessage = 'Please select a district from the suggestions.';
      return;
    }

    if (!this.selectedStreetId) {
      this.errorMessage = 'Please select a street from the selected district.';
      return;
    }

    if (!Number.isFinite(this.form.propertyLatitude) || !Number.isFinite(this.form.propertyLongitude)) {
      this.errorMessage = 'Please click the exact property location on the map.';
      return;
    }

    if (!this.authService.isLoggedIn) {
      this.errorMessage = 'Your session expired. Please sign in again before submitting.';
      return;
    }

    // Fresh duplicate check right before publishing so agents cannot post
    // the same apartment twice (area + price + street + rooms/bedrooms/floor).
    if (this.isEditMode) {
      this.duplicateMatch = null;
    } else if (this.duplicateDismissedForKey !== this.duplicateSignature) {
      try {
        const apartments = await firstValueFrom(this.apartmentService.getApartments());
        const duplicate = this.findDuplicate(apartments || []);
        if (duplicate) {
          this.duplicateMatch = duplicate;
          this.errorMessage = `Duplicate Found. The original owner of this listing is ${this.duplicateOwnerName}.`;
          this.activeStep = 1;
          return;
        }
        this.duplicateMatch = null;
      } catch {
        // If the listing catalogue cannot be loaded, continue with publishing
        // rather than blocking the agent.
      }
    } else if (this.duplicateMatch) {
      this.errorMessage = `Duplicate Found. The original owner of this listing is ${this.duplicateOwnerName}.`;
      return;
    }

    this.loading = true;
    const calculationAddress = [
      this.selectedStreetValue,
      this.form.streetNumber,
      this.selectedDistrictValue,
      'Tbilisi',
    ].filter(Boolean).join(', ');
    let nearbyTimes: NearbyWalkingTimes = {};
    try {
      // Google can hang or resolve outside Angular; never let it block publishing.
      nearbyTimes = await Promise.race([
        this.nearbyTimeService.getWalkingTimes(calculationAddress),
        new Promise<NearbyWalkingTimes>((resolve) => setTimeout(() => resolve({}), 8000)),
      ]);
    } catch (error) {
      console.error('Could not calculate nearby walking times:', error);
    }
    // Google callbacks resume outside NgZone, which would leave the page stuck
    // on "loading" until the next click. Re-enter the zone before sending.
    await new Promise<void>((resolve) => this.zone.run(() => resolve()));

    if (this.editPendingId) {
      this.pendingService.updateSubmission(this.editPendingId, this.toCreateApartment(false, nearbyTimes));
      this.loading = false;
      this.successMessage = 'Changes saved and sent for approval.';
      this.openSuccessModal(true, true);
      return;
    }

    if (this.editId) {
      this.apartmentService.updateApartment(this.editId, this.toCreateApartment(true, nearbyTimes)).subscribe({
        next: () => {
          this.loading = false;
          this.successMessage = 'Listing updated.';
          this.openSuccessModal(false, true);
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = error.status === 403
            ? 'You do not have permission to change this listing.'
            : error.status === 401
              ? 'Your session expired. Please sign in again.'
              : `Could not update the listing (HTTP ${error.status || 'network error'}).`;
          this.cdr.detectChanges();
        },
      });
      return;
    }

    if (!this.authService.isAdmin) {
      this.pendingService.submit(this.toCreateApartment(false, nearbyTimes), this.authService.currentUser).subscribe({
        next: () => {
          this.pendingDebug = this.pendingService.getStorageDebug();
          this.loading = false;
          this.successMessage = 'Your apartment was sent for admin confirmation. It will be published after approval.';
          this.openSuccessModal(true);
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.pendingDebug = this.pendingService.getStorageDebug();
          this.errorMessage =
            error.status === 401
              ? 'Your session expired. Please sign in again before submitting.'
              : 'Could not submit this apartment for approval. Please try again.';
        },
      });
      return;
    }

    this.apartmentService.createApartment(this.toCreateApartment(true, nearbyTimes)).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Apartment listing published successfully.';
        this.openSuccessModal(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        const validationMessage = error.error?.errors && typeof error.error.errors === 'object'
          ? Object.values(error.error.errors as Record<string, string[]>).flat().join(' ')
          : '';
        const apiMessage =
          typeof error.error === 'string'
            ? error.error
            : error.error?.message || validationMessage || error.error?.title;

        this.errorMessage =
          apiMessage ||
          (error.status === 500
            ? 'The apartment API encountered a server or database error. Please check the Railway API logs.'
            : `Could not publish the apartment (HTTP ${error.status || 'network error'}).`);
      },
    });
  }

  private openSuccessModal(pending: boolean, edited = false): void {
    this.zone.run(() => {
      this.successModalEdited = edited;
      this.successModalPending = pending;
      this.showSuccessModal = true;
      this.cdr.detectChanges();
    });
  }

  closeSuccessModal(): void {
    this.showSuccessModal = false;
    if (this.successModalEdited) void this.router.navigate(['/my-listings']);
  }

  private toCreateApartment(
    includeImageFile: boolean,
    nearbyTimes: NearbyWalkingTimes = {},
  ): CreateApartment {
    const district = this.selectedDistrictValue || this.form.location;
    const street = this.selectedStreetValue || this.form.street;
    const addressParts = [street, this.form.streetNumber, district].filter(Boolean);
    const title = this.form.title.trim() || `${this.form.realEstateType} ${this.form.dealType}`;
    const currentUser = this.authService.currentUser;
    const planLabel = this.isExclusivePlan ? 'Velven Exclusive' : 'Basic List';
    // When editing, the listing keeps its original owner, not whoever is editing it.
    const ownerId = this.isEditMode ? this.metaTag(this.editOriginalMeta, 'Owner ID') : currentUser?.id;
    const ownerEmail = this.isEditMode ? this.metaTag(this.editOriginalMeta, 'Owner Email') : currentUser?.email;
    const meta = [
      `Listing plan: ${planLabel}`,
      `Type: ${this.form.realEstateType}`,
      `Deal: ${this.form.dealType}`,
      `Status: ${this.form.buildingStatus}`,
      `Condition: ${this.form.condition}`,
      district ? `District: ${district}` : '',
      street ? `Street: ${street}` : '',
      this.selectedStreetId ? `Street ID: ${this.selectedStreetId}` : '',
      this.form.streetNumber ? `Building: ${this.form.streetNumber}` : '',
      this.form.area ? `Area: ${this.form.area} m2` : '',
      this.form.rooms ? `Rooms: ${this.form.rooms}` : '',
      this.form.bedrooms ? `Bedrooms: ${this.form.bedrooms}` : '',
      this.form.bathrooms ? `Bathrooms: ${this.form.bathrooms}` : '',
      this.form.floor ? `Floor: ${this.form.floor}/${this.form.totalFloors || '?'}` : '',
      `Currency: ${this.form.currency}`,
      this.form.sqPrice ? `Sq. price: ${this.form.sqPrice}` : '',
      this.form.exchangePossible ? 'Exchange possible' : '',
      this.form.hasParking && this.form.parkingCondition
        ? `Parking type: ${this.parkingTypeOptions.find((option) => option.value === this.form.parkingCondition)?.label || this.form.parkingCondition}`
        : '',
      this.form.parkingCondition
        ? `Parking score: ${this.parkingPointsFor(this.form.parkingCondition)}`
        : '',
      this.form.viewType ? `View type: ${this.form.viewType}` : '',
      this.form.minimumRentalPeriod ? `Minimum rental: ${this.form.minimumRentalPeriod}` : '',
      this.form.availableFrom ? `Available from: ${this.form.availableFrom}` : '',
      this.form.maxOccupants ? `Max occupants: ${this.form.maxOccupants}` : '',
      this.form.isQuietStreet ? 'Quiet street: Yes' : '',
      this.form.hasLargeLivingRoom ? 'Large living room: Yes' : '',
      this.form.hasPlaygroundNearby ? 'Playground nearby: Yes' : '',
      this.form.hasCoworkingNearby ? 'Cafés / coworking nearby: Yes' : '',
      this.form.hasSecurity ? 'Security or concierge: Yes' : '',
      this.form.isModernBuilding ? 'Modern building: Yes' : '',
      this.form.hasIsolatedBedrooms ? 'Isolated bedrooms: Yes' : '',
      this.form.isAwayFromNightlife ? 'Away from nightlife: Yes' : '',
      this.form.hasCompanyLease ? 'Company lease available: Yes' : '',
      this.form.cadastralCode ? `Cadastral: ${this.form.cadastralCode}` : '',
      this.form.agentName ? `Contact: ${this.form.agentName}` : '',
      ownerId ? `Owner ID: ${ownerId}` : '',
      ownerEmail ? `Owner Email: ${ownerEmail}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const apartment: CreateApartment = {
      title,
      description: `${this.form.description || 'Apartment listing'}\n\n${meta}`,
      price: this.form.totalPrice || 0,
      address: this.form.hideAddress ? [street, district].filter(Boolean).join(', ') : addressParts.join(', '),
      phoneNumber: this.form.agentPhone.trim(),
      ownerName: this.form.contactName.trim(),
      ownerPhoneNumber: this.form.contactPhone.trim(),
      agentName: this.form.agentName.trim(),
      agentPhoneNumber: this.form.agentPhone.trim(),
      city: 'Tbilisi',
      region:
        this.locationEntries.find((entry) => entry.district === district)?.region || 'Tbilisi',
      district,
      street,
      streetId: this.selectedStreetId || undefined,
      propertyLatitude: this.form.propertyLatitude ?? undefined,
      propertyLongitude: this.form.propertyLongitude ?? undefined,
      latitude: this.form.propertyLatitude ?? undefined,
      longitude: this.form.propertyLongitude ?? undefined,
      buildingNumber: this.form.streetNumber.trim(),
      rooms: this.form.rooms ?? 0,
      bedrooms: this.form.bedrooms ?? 0,
      bathrooms: this.form.bathrooms ?? 0,
      sizeSquareMeters: this.form.area ?? 0,
      floor: this.form.floor ?? 0,
      totalFloors: this.form.totalFloors ?? 0,
      hasElevator: this.form.hasElevator,
      hasParking: this.form.hasParking,
      parkingCondition: this.form.parkingCondition || undefined,
      parkingPoints: this.form.parkingCondition ? this.parkingPointsFor(this.form.parkingCondition) : undefined,
      isQuietStreet: this.form.isQuietStreet,
      hasBalcony: this.form.hasBalcony,
      hasBathtub: this.form.hasBathtub,
      hasAirConditioning: this.form.hasAirConditioning,
      hasDishwasher: this.form.hasDishwasher,
      isPetFriendly: this.form.isPetFriendly,
      hasHomeOfficeSpace: this.form.hasHomeOfficeSpace,
      hasLargeKitchen: this.form.hasLargeKitchen,
      hasView: this.form.hasView,
      viewType: this.form.viewType || undefined,
      minimumRentalPeriod: this.form.minimumRentalPeriod || undefined,
      availableFrom: this.form.availableFrom || undefined,
      maxOccupants: this.form.maxOccupants ?? undefined,
      isFurnished: this.form.isFurnished,
      apartmentStyle: this.form.apartmentStyle,
      metroDistanceMinutes: nearbyTimes.metroDistanceMinutes,
      gymDistanceMinutes: nearbyTimes.gymDistanceMinutes,
      groceryDistanceMinutes: nearbyTimes.groceryDistanceMinutes,
      cafeDistanceMinutes: nearbyTimes.cafeDistanceMinutes,
      parkDistanceMinutes: nearbyTimes.parkDistanceMinutes,
      schoolDistanceMinutes: nearbyTimes.schoolDistanceMinutes,
      kindergartenDistanceMinutes: nearbyTimes.kindergartenDistanceMinutes,
      universityDistanceMinutes: nearbyTimes.universityDistanceMinutes,
      imageUrl: this.form.imageUrls[0] || undefined,
      imageUrls: this.form.imageUrls.length ? this.form.imageUrls : undefined,
    };

    if (includeImageFile && this.selectedImages.length) {
      apartment.imageFile = this.selectedImages[0];
      apartment.imageFiles = [...this.selectedImages];
    }

    return apartment;
  }

  private prepareImage(file: File): Promise<PreparedImage> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Could not read image.'));
      reader.onload = () => {
        const image = new Image();

        image.onerror = () => reject(new Error('Could not load image.'));
        image.onload = () => {
          const maxSize = 1280;
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) {
            reject(new Error('Canvas is unavailable.'));
            return;
          }

          canvas.width = width;
          canvas.height = height;
          context.drawImage(image, 0, 0, width, height);
          const previewUrl = canvas.toDataURL('image/jpeg', 0.82);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Could not optimize image.'));
                return;
              }

              const baseName = file.name.replace(/\.[^.]+$/, '') || 'apartment-photo';
              resolve({
                previewUrl,
                file: new File([blob], `${baseName}.jpg`, {
                  type: 'image/jpeg',
                  lastModified: file.lastModified,
                }),
              });
            },
            'image/jpeg',
            0.82,
          );
        };

        image.src = String(reader.result || '');
      };

      reader.readAsDataURL(file);
    });
  }
}
