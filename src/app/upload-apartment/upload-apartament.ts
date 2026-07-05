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
  imageUrl: string;
  imageUrls: string[];
  contactName: string;
  contactPhone: string;
  contactEmail: string;
};

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

  toggle(field: 'hideAddress' | 'exchangePossible'): void {
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
      } catch {
        this.imageUploadMessage = 'One of the selected images could not be processed.';
      }
    }

    this.form.imageUrl = this.form.imageUrls[0] || '';
    input.value = '';
  }

  removeImage(index: number): void {
    this.form.imageUrls = this.form.imageUrls.filter((_, imageIndex) => imageIndex !== index);
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

    if (!this.authService.isAdmin) {
      this.pendingService.submit(this.toCreateApartment(), this.authService.currentUser);
      this.pendingDebug = this.pendingService.getStorageDebug();
      this.loading = false;
      this.successMessage = 'Your apartment was sent for agent confirmation. It will be published after approval.';
      return;
    }

    this.apartmentService.createApartment(this.toCreateApartment()).subscribe({
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

  private toCreateApartment(): CreateApartment {
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

    return {
      title,
      description: `${this.form.description || 'Apartment listing'}\n\n${meta}`,
      price: this.form.totalPrice || 0,
      address: this.form.hideAddress ? this.form.location : addressParts.join(', '),
      imageUrl: this.form.imageUrls[0] || undefined,
      imageUrls: this.form.imageUrls.length ? this.form.imageUrls : undefined,
    };
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
