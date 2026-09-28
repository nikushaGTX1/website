import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OwnerLinkInfo, OwnerListingService } from '../services/owner-listing.service';

@Component({ selector: 'app-owner-listing', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './owner-listing.html', styleUrl: './owner-listing.css' })
export class OwnerListing implements OnInit {
  readonly features = [
    ['hasElevator', 'Elevator'], ['hasParking', 'Parking'], ['hasBalcony', 'Balcony'], ['hasAirConditioning', 'Air conditioning'],
    ['hasDishwasher', 'Dishwasher'], ['hasBathtub', 'Bathtub'], ['isFurnished', 'Furnished'], ['isPetFriendly', 'Pets allowed'], ['hasView', 'View'],
  ];
  token = ''; info?: OwnerLinkInfo; loading = true; submitting = false; submitted = false; error = ''; previews: string[] = []; photos: File[] = [];
  ownerName = ''; ownerPhone = ''; ownerEmail = '';
  data: Record<string, any> = { realEstateType: 'Apartment', dealType: '', condition: '', location: '', street: '', streetNumber: '', totalPrice: null,
    currency: '$', area: null, rooms: null, bedrooms: null, bathrooms: null, floor: null, totalFloors: null, hasElevator: false,
    hasParking: false, hasBalcony: false, hasAirConditioning: false, hasDishwasher: false, hasBathtub: false, isFurnished: false,
    isPetFriendly: false, hasView: false, availableFrom: '', minimumRentalPeriod: '', description: '', contactName: '', contactPhone: '' };
  constructor(private route: ActivatedRoute, private service: OwnerListingService) {}
  ngOnInit(): void { this.token = this.route.snapshot.paramMap.get('token') || ''; this.service.getLink(this.token).subscribe({
    next: info => { this.info = info; this.data['dealType'] = info.dealType === 'Rent' ? 'For Rent' : 'For Sale'; this.loading = false; },
    error: () => { this.error = 'This owner link is invalid or no longer active.'; this.loading = false; }
  }); }
  toggle(key: string): void { this.data[key] = !this.data[key]; }
  choosePhotos(event: Event): void { const input = event.target as HTMLInputElement; const next = Array.from(input.files || []).filter(f => f.type.startsWith('image/')).slice(0, 15 - this.photos.length); this.photos.push(...next); this.previews.push(...next.map(f => URL.createObjectURL(f))); input.value = ''; }
  removePhoto(index: number): void { URL.revokeObjectURL(this.previews[index]); this.previews.splice(index, 1); this.photos.splice(index, 1); }
  submit(): void { if (this.submitting || !this.ownerName.trim() || !this.ownerPhone.trim()) return; this.submitting = true; this.error = '';
    this.data['contactName'] = this.ownerName.trim(); this.data['contactPhone'] = this.ownerPhone.trim();
    this.service.submit(this.token, this.data, this.ownerName, this.ownerPhone, this.ownerEmail, this.photos).subscribe({ next: () => { this.submitting = false; this.submitted = true; window.scrollTo({ top: 0, behavior: 'smooth' }); }, error: e => { this.submitting = false; this.error = e.error?.message || 'Could not send your property. Please try again.'; } });
  }
}
