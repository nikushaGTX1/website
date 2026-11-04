import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiLocation, LocationSuggestion } from '../models/location';
import { LocationService } from '../services/location.service';
import { PropertyPointPickerComponent } from '../maps/property-point-picker/property-point-picker.component';
import { DatePickerComponent } from '../shared/date-picker/date-picker.component';
import { OwnerLinkInfo, OwnerListingService } from '../services/owner-listing.service';
import { TranslationService } from '../services/translation.service';
import { PhotoUrlPipe } from '../shared/photo-url.pipe';

type FieldKey = 'location' | 'street' | 'streetNumber' | 'totalPrice' | 'area' | 'rooms' | 'ownerName' | 'ownerPhone' | 'ownerEmail' | 'floor' | 'city' | 'condition' | 'buildingType' | 'availableFrom' | 'description' | 'photos' | 'maxOccupants';

@Component({ selector: 'app-owner-listing', standalone: true, imports: [RouterLink, PhotoUrlPipe, CommonModule, FormsModule, PropertyPointPickerComponent, DatePickerComponent], templateUrl: './owner-listing.html', styleUrl: './owner-listing.css' })
export class OwnerListing implements OnInit, OnDestroy {
  readonly maxPhotos = 15;
  readonly propertyTypes = [
    { value: 'Apartment', icon: 'fa-solid fa-building' },
    { value: 'Private house', icon: 'fa-solid fa-house' },
    { value: 'Country house', icon: 'fa-solid fa-house-chimney' },
    { value: 'Commercial area', icon: 'fa-solid fa-store' },
  ];
  readonly conditions = [
    { value: 'Newly Renovated', icon: 'fa-solid fa-wand-magic-sparkles' },
    { value: 'Old renovated', icon: 'fa-solid fa-couch' },
    { value: 'Current renovation', icon: 'fa-solid fa-person-digging' },
    { value: 'Repairing', icon: 'fa-solid fa-screwdriver-wrench' },
    { value: 'White frame', icon: 'fa-regular fa-square' },
    { value: 'Black frame', icon: 'fa-solid fa-square' },
    { value: 'Green frame', icon: 'fa-solid fa-seedling' },
    { value: 'White Plus', icon: 'fa-regular fa-square-plus' },
  ];
  readonly features = [
    { field: 'hasElevator', label: 'Elevator', icon: 'fa-solid fa-elevator' },
    { field: 'hasParking', label: 'Parking', icon: 'fa-solid fa-square-parking' },
    { field: 'hasBalcony', label: 'Balcony', icon: 'fa-solid fa-building' },
    { field: 'hasAirConditioning', label: 'Air conditioning', icon: 'fa-solid fa-snowflake' },
    { field: 'hasDishwasher', label: 'Dishwasher', icon: 'fa-solid fa-kitchen-set' },
    { field: 'hasBathtub', label: 'Bathtub', icon: 'fa-solid fa-bath' },
    { field: 'isFurnished', label: 'Furnished', icon: 'fa-solid fa-couch' },
    { field: 'isPetFriendly', label: 'Pets allowed', icon: 'fa-solid fa-paw' },
    { field: 'hasView', label: 'Scenic view', icon: 'fa-solid fa-panorama' },
    { field: 'isQuietStreet', label: 'Quiet street', icon: 'fa-solid fa-volume-xmark' },
  ];
  readonly rentalPeriods = ['Minimum 6 months', 'Minimum 12 months'];
  readonly counters: Array<{ field: string; label: string; icon: string; min: number }> = [
    // Singular labels read naturally above a count in Georgian (ოთახი / საძინებელი / სააბაზანო).
    { field: 'rooms', label: 'Room', icon: 'fa-solid fa-door-open', min: 1 },
    { field: 'bedrooms', label: 'Bedroom', icon: 'fa-solid fa-bed', min: 0 },
    { field: 'bathrooms', label: 'Bathroom', icon: 'fa-solid fa-bath', min: 0 },
  ];

  token = ''; info?: OwnerLinkInfo; loading = true; submitting = false; submitted = false; attempted = false; error = '';
  general = false;
  editId: number | null = null;
  existingPhotos: string[] = [];
  readonly requestId = crypto.randomUUID();
  previews: string[] = []; photos: File[] = []; dragOver = false;
  ownerName = ''; ownerPhone = ''; ownerEmail = '';
  data: Record<string, any> = { realEstateType: 'Apartment', dealType: '', condition: '', location: '', street: '', streetNumber: '', totalPrice: null,
    currency: '$', area: null, rooms: 1, bedrooms: 1, bathrooms: 1, floor: null, totalFloors: null, hasElevator: false,
    hasParking: false, hasBalcony: false, hasAirConditioning: false, hasDishwasher: false, hasBathtub: false, isFurnished: false,
    isPetFriendly: false, hasView: false, isQuietStreet: false, availableFrom: '', minimumRentalPeriod: '', propertyLatitude: null, propertyLongitude: null, contactName: '', contactPhone: '' };

  locationEntries: ApiLocation[] = []; locationLoading = true; locationError = false;
  picker: 'area' | 'street' | null = null;
  selectedDistrict = ''; selectedStreetValue = ''; selectedStreetId: number | null = null;

  constructor(private route: ActivatedRoute, private service: OwnerListingService, private locationService: LocationService, private translationService: TranslationService, private cdr: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.general = !this.token;
    this.editId = Number(this.route.snapshot.paramMap.get('id')) || null;
    if (this.general) {
      this.data['city'] = 'Tbilisi'; this.data['buildingType'] = ''; this.data['description'] = '';
      this.info = { dealType: 'Rent', agentName: 'Velven' }; this.data['dealType'] = 'For Rent'; this.loading = false;
      if (this.editId) {
        this.info = undefined; this.loading = true;
        this.service.getSubmission(this.editId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: row => {
          if (!row.isGeneralSubmission) { this.info = undefined; this.error = 'ეს განაცხადი ამ ფორმით არ რედაქტირდება.'; return; }
          this.data = { ...this.data, ...row.data }; this.ownerName = row.ownerName; this.ownerPhone = row.ownerPhone; this.ownerEmail = row.ownerEmail || '';
          this.selectedDistrict = row.data['location']; this.selectedStreetValue = row.data['street']; this.selectedStreetId = row.data['streetId'];
          this.info = { dealType: row.dealType, agentName: row.agentName || 'Velven' }; this.existingPhotos = row.photos; this.loading = false; this.cdr.markForCheck();
        }, error: () => { this.info = undefined; this.loading = false; this.error = 'განაცხადი ვერ ჩაიტვირთა.'; this.cdr.markForCheck(); },
      });
      }
    } else this.service.getLink(this.token).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: info => { this.info = info; this.data['dealType'] = info.dealType === 'Rent' ? 'For Rent' : 'For Sale'; this.loading = false; },
      error: () => { this.error = 'This owner link is invalid or no longer active.'; this.loading = false; },
    });
    this.locationService.getLocations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: locations => { this.locationEntries = locations; this.locationLoading = false; },
      error: () => { this.locationLoading = false; this.locationError = true; },
    });
  }

  ngOnDestroy(): void { this.previews.forEach(url => URL.revokeObjectURL(url)); }
  setDeal(deal: 'Rent' | 'Sale'): void { if (this.info) this.info.dealType = deal; this.data['dealType'] = deal === 'Rent' ? 'For Rent' : 'For Sale'; }

  @HostListener('document:click') closePicker(): void { this.picker = null; }

  private get language() { return this.translationService.language$.value; }
  private normalize(value: string): string {
    return (value || '').trim().toLocaleLowerCase().replace(/(?:street|st\.?|ქუჩა|ქ\.?|улица|ул\.?)$/i, '').replace(/[^a-z0-9Ⴀ-ჿЀ-ӿ]+/g, '');
  }

  get areaSuggestions(): LocationSuggestion[] {
    const query = this.data['location'].trim().toLowerCase();
    const seen = new Set<string>();
    return this.locationEntries
      .filter(entry => entry.city === 'Tbilisi' && entry.district !== 'All Tbilisi')
      .filter(entry => !query || [entry.district, this.locationService.districtName(entry, 'ka')].some(name => name.toLowerCase().includes(query)))
      .filter(entry => { const key = this.normalize(entry.district); if (seen.has(key)) return false; seen.add(key); return true; })
      .slice(0, 12)
      .map(entry => ({ id: entry.id, label: this.locationService.districtName(entry, this.language), value: entry.district, type: 'Area' }));
  }

  private streetCache = { key: '', value: [] as LocationSuggestion[] };
  get streetSuggestions(): LocationSuggestion[] {
    if (!this.selectedDistrict) return [];
    const key = `${this.selectedDistrict}|${this.data['street']}|${this.language}|${this.locationEntries.length}`;
    if (this.streetCache.key !== key) {
      const value = this.locationService.searchStreets(this.locationEntries, this.selectedDistrict, this.data['street'] || '', this.language)
        .map(s => ({ id: s.id, label: s.label, value: s.value, type: 'Street' as const, district: s.district || this.data['location'], districtValue: s.districtValue }));
      this.streetCache = { key, value };
    }
    return this.streetCache.value;
  }

  get mapAddress(): string {
    if (!this.selectedStreetValue) return '';
    return [this.data['street'], this.data['streetNumber'], this.data['location'], 'Tbilisi'].filter(part => (part || '').trim()).join(', ');
  }
  clearPoint(): void { this.data['propertyLatitude'] = null; this.data['propertyLongitude'] = null; }

  onAreaInput(): void { this.clearPoint(); this.selectedDistrict = ''; this.data['street'] = ''; this.selectedStreetValue = ''; this.selectedStreetId = null; this.picker = 'area'; }
  onStreetInput(): void { this.clearPoint(); this.selectedStreetValue = ''; this.selectedStreetId = null; this.picker = 'street'; }

  // pointerdown runs before the input blur, so one tap selects.
  selectArea(suggestion: LocationSuggestion, event: Event): void {
    event.preventDefault();
    this.clearPoint();
    this.data['location'] = suggestion.label;
    this.selectedDistrict = suggestion.value || suggestion.label;
    this.data['street'] = ''; this.selectedStreetValue = ''; this.selectedStreetId = null;
    this.picker = null;
  }

  selectStreet(suggestion: LocationSuggestion, event: Event): void {
    event.preventDefault();
    this.clearPoint();
    this.data['street'] = suggestion.label;
    this.selectedStreetValue = suggestion.value || suggestion.label;
    this.selectedStreetId = suggestion.id || null;
    if (suggestion.districtValue && suggestion.districtValue !== this.selectedDistrict) {
      this.selectedDistrict = suggestion.districtValue;
      this.data['location'] = suggestion.district || suggestion.districtValue;
    }
    this.picker = null;
  }

  step(field: string, delta: number, min: number): void { this.data[field] = Math.max(min, Math.min(20, (Number(this.data[field]) || 0) + delta)); }
  adjustOccupants(delta: number): void { this.data['maxOccupants'] = Math.max(1, Math.min(50, (Number(this.data['maxOccupants']) || 0) + delta)); }
  toggle(key: string): void { this.data[key] = !this.data[key]; }

  addFiles(files: FileList | null): void {
    const selected = Array.from(files || []);
    if (this.general && selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) {
      this.error = 'აირჩიეთ JPG, PNG ან WebP ფოტო, მაქსიმუმ 8 მბ.'; return;
    }
    const next = selected.filter(file => file.type.startsWith('image/')).slice(0, this.maxPhotos - this.photos.length);
    this.photos.push(...next);
    this.previews.push(...next.map(file => URL.createObjectURL(file)));
  }
  choosePhotos(event: Event): void { const input = event.target as HTMLInputElement; this.addFiles(input.files); input.value = ''; }
  dropPhotos(event: DragEvent): void { event.preventDefault(); this.dragOver = false; this.addFiles(event.dataTransfer?.files || null); }
  removePhoto(index: number): void { URL.revokeObjectURL(this.previews[index]); this.previews.splice(index, 1); this.photos.splice(index, 1); }

  get errors(): Partial<Record<FieldKey, string>> {
    const e: Partial<Record<FieldKey, string>> = {};
    const d = this.data;
    if (!this.selectedDistrict) e.location = 'Choose a district from the list';
    if (!this.selectedStreetValue) e.street = this.selectedDistrict ? 'Choose a street from the list' : 'Choose a district first';
    if (!/^\d+[\p{L}]?(?:[\/-]\d+[\p{L}]?)?$/u.test((d['streetNumber'] || '').trim())) e.streetNumber = 'Enter a valid building number, e.g. 12 or 12a';
    if (!(Number(d['totalPrice']) > 0)) e.totalPrice = 'Enter a price';
    if (!(Number(d['area']) >= 5 && Number(d['area']) <= 10000)) e.area = 'Area must be between 5 and 10000 m²';
    if (!(Number(d['rooms']) >= 1)) e.rooms = 'At least 1 room';
    if (d['floor'] != null && d['totalFloors'] != null && Number(d['floor']) > Number(d['totalFloors'])) e.floor = 'Floor cannot be above total floors';
    if (this.ownerName.trim().length < 2) e.ownerName = 'Enter your name';
    const digits = this.ownerPhone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) e.ownerPhone = 'Enter a valid phone number, e.g. 5XX XX XX XX';
    if (this.ownerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.ownerEmail.trim())) e.ownerEmail = 'Enter a valid email';
    if (this.general) {
      if (d['maxOccupants'] != null && (!Number.isInteger(d['maxOccupants']) || d['maxOccupants'] < 1 || d['maxOccupants'] > 50)) e.maxOccupants = 'მიუთითეთ მთელი რიცხვი 1-დან 50-მდე.';
      if ((d['city'] || '').trim().length < 2) e.city = 'მიუთითეთ ქალაქი.';
      if (!d['condition']) e.condition = 'აირჩიეთ ბინის მდგომარეობა.';
      if (!d['buildingType']) e.buildingType = 'აირჩიეთ შენობის ტიპი.';
      if (!d['availableFrom']) e.availableFrom = 'მიუთითეთ ხელმისაწვდომობის თარიღი.';
      if ((d['description'] || '').trim().length < 5) e.description = 'შეიყვანეთ ბინის აღწერა.';
      if (!this.photos.length && !this.existingPhotos.length) e.photos = 'ატვირთეთ მინიმუმ ერთი ფოტო.';
      if (d['floor'] == null || d['floor'] < 0 || !d['totalFloors'] || d['floor'] > d['totalFloors']) e.floor = 'შეამოწმეთ სართული და სართულების რაოდენობა.';
      if (d['bedrooms'] > d['rooms']) e.rooms = 'საძინებლების რაოდენობა ოთახების რაოდენობას ვერ გადააჭარბებს.';
      if (d['city'] !== 'Tbilisi') {
        if ((d['location'] || '').trim().length >= 2) delete e.location;
        if ((d['street'] || '').trim().length >= 2) delete e.street;
      }
    }
    return e;
  }

  showError(field: FieldKey): string { return this.attempted ? this.errors[field] || '' : ''; }

  get progress(): number {
    const checks = [!!this.selectedDistrict, !!this.selectedStreetValue, !this.errors.streetNumber, !this.errors.totalPrice, !this.errors.area,
      this.info?.dealType === 'Rent' || !!this.data['condition'], this.photos.length > 0, !this.errors.ownerName, !this.errors.ownerPhone];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }

  submit(): void {
    if (this.submitting || this.submitted) return;
    this.attempted = true; this.error = '';
    const firstInvalid = Object.keys(this.errors)[0];
    if (firstInvalid) {
      setTimeout(() => document.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    this.submitting = true;
    // Canonical district/street values let the agent import resolve them to catalog entries.
    const payload = { ...this.data, location: this.selectedDistrict || this.data['location'], street: this.selectedStreetValue || this.data['street'], streetId: this.selectedStreetId,
      streetNumber: this.data['streetNumber'].trim(), contactName: this.ownerName.trim(), contactPhone: this.ownerPhone.trim() };
    const request: Observable<unknown> = this.editId ? this.service.updateSubmission(this.editId, { data: payload, ownerName: this.ownerName, ownerPhone: this.ownerPhone })
      : this.service.submit(this.token, payload, this.ownerName.trim(), this.ownerPhone.trim(), this.ownerEmail.trim(), this.photos, this.general ? this.requestId : undefined);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.submitting = false; this.submitted = true; window.scrollTo({ top: 0, behavior: 'smooth' }); this.cdr.markForCheck(); },
      error: e => { this.submitting = false; this.error = e.error?.message || 'Could not send your property. Please try again.'; this.cdr.markForCheck(); },
    });
  }
}
