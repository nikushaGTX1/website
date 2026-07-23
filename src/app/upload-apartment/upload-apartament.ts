import { Component } from '@angular/core';
import { ApartmentService } from '../services/apartment.service';
import { CreateApartment } from '../models/apartment';
import { AuthService } from '../services/auth.service';
import { PendingApartment, PendingApartmentService } from '../services/pending-apartment.service';

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
  contactEmail: string;
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

@Component({
  selector: 'app-upload-apartment',
  standalone: false,
  templateUrl: './upload-apartaments.html',
  styleUrl: './upload-apartment.css',
})
export class UploadApartment {
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
    contactEmail: '',
  };

  loading = false;
  successMessage = '';
  errorMessage = '';
  userMessages: PendingApartment[] = [];
  pendingDebug = '';
  imageUploadMessage = '';
  private selectedImageFiles: File[] = [];

  constructor(
    private apartmentService: ApartmentService,
    private authService: AuthService,
    private pendingService: PendingApartmentService
  ) {
    this.userMessages = this.pendingService
      .getForUser(this.authService.currentUser)
      .filter((item) => item.status === 'declined');
    this.pendingDebug = this.pendingService.getStorageDebug();
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

    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) {
        this.imageUploadMessage = 'Only image files are supported.';
        continue;
      }

      try {
        const imageDataUrl = await this.resizeImage(file);
        this.form.imageUrls = [...this.form.imageUrls, imageDataUrl].slice(0, this.maxImages);
        this.selectedImageFiles = [...this.selectedImageFiles, file].slice(0, this.maxImages);
      } catch {
        this.imageUploadMessage = 'One of the selected images could not be processed.';
      }
    }

    this.form.imageUrl = this.form.imageUrls[0] || '';
    input.value = '';
  }

  removeImage(index: number): void {
    this.form.imageUrls = this.form.imageUrls.filter((_, imageIndex) => imageIndex !== index);
    this.selectedImageFiles = this.selectedImageFiles.filter((_, imageIndex) => imageIndex !== index);
    this.form.imageUrl = this.form.imageUrls[0] || '';
  }

  publish(): void {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.form.location || !this.form.totalPrice) {
      this.errorMessage = 'Please fill in location and total price before publishing.';
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
      error: () => {
        this.loading = false;
        this.errorMessage = 'Could not publish right now. The form is ready, but the API did not respond.';
      },
    });
  }

  private toCreateApartment(includeImageFile: boolean): CreateApartment {
    const addressParts = [this.form.location, this.form.street, this.form.streetNumber].filter(Boolean);
    const title = this.form.title.trim() || `${this.form.realEstateType} ${this.form.dealType}`;
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
      this.form.contactPhone ? `Phone: ${this.form.contactPhone}` : '',
      this.form.contactEmail ? `Email: ${this.form.contactEmail}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const apartment: CreateApartment = {
      title,
      description: `${this.form.description || 'Apartment listing'}\n\n${meta}`,
      price: this.form.totalPrice || 0,
      address: this.form.hideAddress ? this.form.location : addressParts.join(', '),
      city: 'Tbilisi',
      district: this.form.location,
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

    if (includeImageFile && this.selectedImageFiles[0]) {
      apartment.imageFile = this.selectedImageFiles[0];
    }

    return apartment;
  }

  private resizeImage(file: File): Promise<string> {
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
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        };

        image.src = String(reader.result || '');
      };

      reader.readAsDataURL(file);
    });
  }
}
