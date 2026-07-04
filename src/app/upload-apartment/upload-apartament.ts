import { Component } from '@angular/core';
import { ApartmentService } from '../services/apartment.service';
import { CreateApartment } from '../models/apartment';

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
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  };

  loading = false;
  successMessage = '';
  errorMessage = '';

  constructor(private apartmentService: ApartmentService) {}

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

  publish(): void {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.form.location || !this.form.totalPrice) {
      this.errorMessage = 'Please fill in location and total price before publishing.';
      return;
    }

    this.loading = true;
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
      imageUrl: this.form.imageUrl || undefined,
    };
  }
}
