import { Component, HostListener, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApartmentService } from '../services/apartment.service';
import { CreateApartment } from '../models/apartment';
import { AuthService } from '../services/auth.service';
import { PendingApartment, PendingApartmentService } from '../services/pending-apartment.service';
import { ApiLocation, LocationSuggestion } from '../models/location';
import { LocationService } from '../services/location.service';

type UploadForm = {
  realEstateType: string;
  dealType: string;
  buildingStatus: string;
  condition: string;
  location: string;
  street: string;
  streetNumber: string;
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
  hasBalcony: boolean;
  hasBathtub: boolean;
  hasAirConditioning: boolean;
  hasDishwasher: boolean;
  isPetFriendly: boolean;
  hasHomeOfficeSpace: boolean;
  hasLargeKitchen: boolean;
  hasView: boolean;
  isFurnished: boolean;
  apartmentStyle: string;
  imageUrl: string;
  imageUrls: string[];
  contactName: string;
  contactPhone: string;
};

type BooleanFeature =
  | 'hasElevator'
  | 'hasParking'
  | 'hasBalcony'
  | 'hasBathtub'
  | 'hasAirConditioning'
  | 'hasDishwasher'
  | 'isPetFriendly'
  | 'hasHomeOfficeSpace'
  | 'hasLargeKitchen'
  | 'hasView'
  | 'isFurnished';

interface PreparedImage {
  previewUrl: string;
  file: File;
}

@Component({
  selector: 'app-upload-apartment',
  standalone: false,
  templateUrl: './upload-apartaments.html',
  styleUrl: './upload-apartment.css',
})
export class UploadApartment implements OnInit {
  readonly maxImages = 15;

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

  readonly featureOptions: Array<{ label: string; field: BooleanFeature }> = [
    { label: 'Elevator', field: 'hasElevator' },
    { label: 'Parking', field: 'hasParking' },
    { label: 'Balcony', field: 'hasBalcony' },
    { label: 'Bathtub', field: 'hasBathtub' },
    { label: 'Air conditioning', field: 'hasAirConditioning' },
    { label: 'Dishwasher', field: 'hasDishwasher' },
    { label: 'Pet friendly', field: 'isPetFriendly' },
    { label: 'Home office space', field: 'hasHomeOfficeSpace' },
    { label: 'Large kitchen', field: 'hasLargeKitchen' },
    { label: 'View', field: 'hasView' },
    { label: 'Furnished', field: 'isFurnished' },
  ];

  form: UploadForm = {
    realEstateType: 'Apartment',
    dealType: 'For Sale',
    buildingStatus: 'Old building',
    condition: 'Newly Renovated',
    location: '',
    street: '',
    streetNumber: '',
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
    hasBalcony: false,
    hasBathtub: false,
    hasAirConditioning: false,
    hasDishwasher: false,
    isPetFriendly: false,
    hasHomeOfficeSpace: false,
    hasLargeKitchen: false,
    hasView: false,
    isFurnished: false,
    apartmentStyle: 'Modern',
    imageUrl: '',
    imageUrls: [],
    contactName: '',
    contactPhone: '',
  };

  loading = false;
  successMessage = '';
  errorMessage = '';
  userMessages: PendingApartment[] = [];
  pendingDebug = '';
  imageUploadMessage = '';
  selectedImages: File[] = [];
  locationEntries: ApiLocation[] = [];
  locationLoading = false;
  locationError = false;
  locationPicker: 'area' | 'street' | null = null;
  selectedDistrictValue = '';
  selectedStreetValue = '';

  constructor(
    private apartmentService: ApartmentService,
    private authService: AuthService,
    private pendingService: PendingApartmentService,
    private locationService: LocationService,
  ) {
    this.userMessages = this.pendingService
      .getForUser(this.authService.currentUser)
      .filter((item) => item.status === 'declined');
    this.pendingDebug = this.pendingService.getStorageDebug();
  }

  ngOnInit(): void {
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

  @HostListener('document:click')
  closeLocationPicker(): void {
    this.locationPicker = null;
  }

  get uploadAreaSuggestions(): LocationSuggestion[] {
    const query = this.form.location.trim().toLowerCase();
    const language = this.locationService.languageForQuery(this.form.location);
    return this.locationEntries
      .filter((entry) => entry.city === 'Tbilisi')
      .filter((entry) =>
        !query ||
        entry.district.toLowerCase().includes(query) ||
        this.locationService.districtName(entry, language).toLowerCase().includes(query),
      )
      .slice(0, 10)
      .map((entry) => ({
        label: this.locationService.districtName(entry, language),
        value: entry.district,
        type: 'Area',
        city: this.locationService.cityName(entry, language),
      }));
  }

  get uploadStreetSuggestions(): LocationSuggestion[] {
    const query = this.form.street.trim().toLowerCase();
    const language = this.locationService.languageForQuery(this.form.street, this.form.location);
    if (!this.selectedDistrictValue && query.length < 2) return [];
    const suggestions: LocationSuggestion[] = [];

    for (const entry of this.locationEntries.filter((item) =>
      item.city === 'Tbilisi' &&
      (!this.selectedDistrictValue || item.district === this.selectedDistrictValue),
    )) {
      for (const street of this.locationService.streetNames(entry, language)) {
        if (!query || street.value.toLowerCase().includes(query) || street.label.toLowerCase().includes(query)) {
          suggestions.push({
            label: street.label,
            value: street.value,
            type: 'Street',
            district: this.locationService.districtName(entry, language),
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
    this.selectedDistrictValue = '';
    this.openLocationPicker('area');
  }

  onStreetInput(): void {
    this.selectedStreetValue = '';
    this.openLocationPicker('street');
  }

  selectUploadArea(suggestion: LocationSuggestion): void {
    this.form.location = suggestion.label;
    this.selectedDistrictValue = suggestion.value || suggestion.label;
    this.form.street = '';
    this.selectedStreetValue = '';
    this.locationPicker = 'street';
  }

  selectUploadStreet(suggestion: LocationSuggestion): void {
    this.form.street = suggestion.label;
    this.selectedStreetValue = suggestion.value || suggestion.label;
    this.locationPicker = null;
  }

  uploadLocationText(english: string, georgian: string): string {
    return this.locationService.languageForQuery(this.form.street, this.form.location) === 'ka'
      ? georgian
      : english;
  }

  select(field: keyof UploadForm, value: string): void {
    (this.form[field] as string) = value;
  }

  setCurrency(currency: '$' | 'GEL'): void {
    this.form.currency = currency;
  }

  toggle(field: 'hideAddress' | 'exchangePossible' | BooleanFeature): void {
    this.form[field] = !this.form[field];
  }

  get previewTitle(): string {
    return this.form.title.trim() || `${this.form.realEstateType} ${this.form.dealType.toLowerCase()}`;
  }

  get previewLocation(): string {
    return this.form.location || 'Location';
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
        return !!this.form.location.trim();
      case 2:
        return !!this.form.totalPrice;
      case 3:
        return !!(this.form.area || this.form.rooms || this.form.bedrooms);
      case 4:
        return !!(this.form.title.trim() && this.form.description.trim() && this.uploadedImageCount);
      case 5:
        return !!this.form.contactPhone.trim();
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

  publish(): void {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.form.location || !this.form.totalPrice || !this.form.contactPhone.trim()) {
      this.errorMessage = 'Please fill in location, total price, and phone number before publishing.';
      return;
    }

    this.loading = true;

    if (!this.authService.isAgent) {
      this.pendingService.submit(this.toCreateApartment(false), this.authService.currentUser);
      this.pendingDebug = this.pendingService.getStorageDebug();
      this.loading = false;
      this.successMessage = 'Your apartment was sent for agent confirmation. It will be published after approval.';
      return;
    }

    this.apartmentService.createApartment(this.toCreateApartment(true)).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Apartment listing published successfully.';
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        const apiMessage =
          typeof error.error === 'string'
            ? error.error
            : error.error?.message || error.error?.title;

        this.errorMessage =
          apiMessage ||
          (error.status === 500
            ? 'The apartment API encountered a server or database error. Please check the Railway API logs.'
            : `Could not publish the apartment (HTTP ${error.status || 'network error'}).`);
      },
    });
  }

  private toCreateApartment(includeImageFile: boolean): CreateApartment {
    const district = this.selectedDistrictValue || this.form.location;
    const street = this.selectedStreetValue || this.form.street;
    const addressParts = [district, street, this.form.streetNumber].filter(Boolean);
    const title = this.form.title.trim() || `${this.form.realEstateType} ${this.form.dealType}`;
    const currentUser = this.authService.currentUser;
    const meta = [
      `Type: ${this.form.realEstateType}`,
      `Deal: ${this.form.dealType}`,
      `Status: ${this.form.buildingStatus}`,
      `Condition: ${this.form.condition}`,
      this.form.area ? `Area: ${this.form.area} m2` : '',
      this.form.rooms ? `Rooms: ${this.form.rooms}` : '',
      this.form.bedrooms ? `Bedrooms: ${this.form.bedrooms}` : '',
      this.form.bathrooms ? `Bathrooms: ${this.form.bathrooms}` : '',
      this.form.floor ? `Floor: ${this.form.floor}/${this.form.totalFloors || '?'}` : '',
      `Currency: ${this.form.currency}`,
      this.form.sqPrice ? `Sq. price: ${this.form.sqPrice}` : '',
      this.form.exchangePossible ? 'Exchange possible' : '',
      this.form.cadastralCode ? `Cadastral: ${this.form.cadastralCode}` : '',
      this.form.contactName ? `Contact: ${this.form.contactName}` : '',
      currentUser?.id ? `Owner ID: ${currentUser.id}` : '',
      currentUser?.email ? `Owner Email: ${currentUser.email}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const apartment: CreateApartment = {
      title,
      description: `${this.form.description || 'Apartment listing'}\n\n${meta}`,
      price: this.form.totalPrice || 0,
      address: this.form.hideAddress ? district : addressParts.join(', '),
      phoneNumber: this.form.contactPhone.trim(),
      city: 'Tbilisi',
      region:
        this.locationEntries.find((entry) => entry.district === district)?.region || '',
      district,
      street,
      bedrooms: this.form.bedrooms ?? 0,
      bathrooms: this.form.bathrooms ?? 0,
      sizeSquareMeters: this.form.area ?? 0,
      floor: this.form.floor ?? 0,
      totalFloors: this.form.totalFloors ?? 0,
      hasElevator: this.form.hasElevator,
      hasParking: this.form.hasParking,
      hasBalcony: this.form.hasBalcony,
      hasBathtub: this.form.hasBathtub,
      hasAirConditioning: this.form.hasAirConditioning,
      hasDishwasher: this.form.hasDishwasher,
      isPetFriendly: this.form.isPetFriendly,
      hasHomeOfficeSpace: this.form.hasHomeOfficeSpace,
      hasLargeKitchen: this.form.hasLargeKitchen,
      hasView: this.form.hasView,
      isFurnished: this.form.isFurnished,
      apartmentStyle: this.form.apartmentStyle,
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
