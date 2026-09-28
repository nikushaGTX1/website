import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { OwnerListingService, OwnerSubmission, OwnerSubmissionStatus } from '../../services/owner-listing.service';

type Fact = { key: string; label: string; icon: string; value: string };

@Component({ selector: 'app-owner-submissions', standalone: true, imports: [CommonModule, FormsModule, RouterModule], templateUrl: './owner-submissions.html', styleUrl: './owner-submissions.css' })
export class OwnerSubmissions implements OnInit {
  readonly featureMeta: Record<string, { label: string; icon: string }> = {
    hasElevator: { label: 'Elevator', icon: 'fa-solid fa-elevator' },
    hasParking: { label: 'Parking', icon: 'fa-solid fa-square-parking' },
    hasBalcony: { label: 'Balcony', icon: 'fa-solid fa-building' },
    hasAirConditioning: { label: 'Air conditioning', icon: 'fa-solid fa-snowflake' },
    hasDishwasher: { label: 'Dishwasher', icon: 'fa-solid fa-kitchen-set' },
    hasBathtub: { label: 'Bathtub', icon: 'fa-solid fa-bath' },
    isFurnished: { label: 'Furnished', icon: 'fa-solid fa-couch' },
    isPetFriendly: { label: 'Pets allowed', icon: 'fa-solid fa-paw' },
    hasView: { label: 'Scenic view', icon: 'fa-solid fa-panorama' },
    isQuietStreet: { label: 'Quiet street', icon: 'fa-solid fa-volume-xmark' },
  };
  // Order and presentation of the property answers; anything else in data is hidden.
  readonly factMeta: Array<{ key: string; label: string; icon: string; suffix?: string }> = [
    { key: 'realEstateType', label: 'Type', icon: 'fa-solid fa-building' },
    { key: 'condition', label: 'Condition', icon: 'fa-solid fa-paint-roller' },
    { key: 'area', label: 'Area', icon: 'fa-solid fa-ruler-combined', suffix: ' m²' },
    { key: 'rooms', label: 'Rooms', icon: 'fa-solid fa-door-open' },
    { key: 'bedrooms', label: 'Bedrooms', icon: 'fa-solid fa-bed' },
    { key: 'bathrooms', label: 'Bathrooms', icon: 'fa-solid fa-bath' },
    { key: 'floor', label: 'Floor', icon: 'fa-solid fa-stairs' },
    { key: 'totalFloors', label: 'Total floors', icon: 'fa-solid fa-layer-group' },
    { key: 'availableFrom', label: 'Available from', icon: 'fa-solid fa-calendar-day' },
    { key: 'minimumRentalPeriod', label: 'Min. rental', icon: 'fa-solid fa-hourglass-half' },
  ];
  readonly statuses: Array<{ value: OwnerSubmissionStatus; label: string; icon: string }> = [
    { value: 'new', label: 'New', icon: 'fa-solid fa-star' },
    { value: 'contacted', label: 'Called', icon: 'fa-solid fa-phone' },
    { value: 'visited', label: 'Visited', icon: 'fa-solid fa-house-circle-check' },
    { value: 'published', label: 'Published', icon: 'fa-solid fa-globe' },
    { value: 'rejected', label: 'Rejected', icon: 'fa-solid fa-ban' },
  ];

  submissions: OwnerSubmission[] = []; selected?: OwnerSubmission; loading = true; saving = false; error = ''; saved = false;
  filter: OwnerSubmissionStatus | 'all' = 'all'; search = ''; lightbox: number | null = null;

  constructor(private service: OwnerListingService, private router: Router) {}
  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true; this.error = '';
    this.service.getSubmissions().subscribe({
      next: rows => { this.submissions = rows; this.loading = false; },
      error: e => { this.error = e.error?.message || 'Could not load owner submissions.'; this.loading = false; },
    });
  }

  get visible(): OwnerSubmission[] {
    const q = this.search.trim().toLowerCase();
    return this.submissions.filter(item => (this.filter === 'all' || item.status === this.filter) &&
      (!q || [item.ownerName, item.ownerPhone, item.data?.['location'], item.data?.['street']].some(v => String(v || '').toLowerCase().includes(q))));
  }
  count(status: OwnerSubmissionStatus | 'all'): number { return status === 'all' ? this.submissions.length : this.submissions.filter(s => s.status === status).length; }
  statusLabel(status: OwnerSubmissionStatus): string { return this.statuses.find(s => s.value === status)?.label || status; }

  select(item: OwnerSubmission): void {
    this.saved = false;
    this.service.getSubmission(item.id).subscribe({ next: row => { this.selected = row; this.selected.verification ||= {}; }, error: () => this.error = 'Could not load this submission.' });
  }

  price(item: OwnerSubmission): string {
    const value = Number(item.data?.['totalPrice']);
    if (!value) return '—';
    const symbol = item.data?.['currency'] === 'GEL' ? '₾' : '$';
    return `${symbol}${value.toLocaleString('en-US')}${item.dealType === 'Rent' ? '/mo' : ''}`;
  }
  address(item: OwnerSubmission): string {
    const d = item.data || {};
    return [[d['street'], d['streetNumber']].filter(Boolean).join(' '), d['location']].filter(Boolean).join(', ') || 'No address';
  }
  mapUrl(item: OwnerSubmission): string | null {
    const lat = item.data?.['propertyLatitude'], lng = item.data?.['propertyLongitude'];
    return lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  }

  facts(item: OwnerSubmission): Fact[] {
    return this.factMeta
      .filter(m => item.data?.[m.key] !== null && item.data?.[m.key] !== undefined && item.data?.[m.key] !== '')
      .map(m => ({ key: m.key, label: m.label, icon: m.icon, value: String(item.data[m.key]).replace(/^Minimum /, '') + (m.suffix || '') }));
  }
  features(item: OwnerSubmission): string[] { return Object.keys(this.featureMeta).filter(key => item.data?.[key] === true); }

  // Items the agent confirms on site: location, price, key facts and claimed features.
  checklist(item: OwnerSubmission): Array<{ key: string; label: string; value: string; icon: string }> {
    const rows = [
      { key: 'location', label: 'Address', value: this.address(item), icon: 'fa-solid fa-location-dot' },
      { key: 'totalPrice', label: 'Price', value: this.price(item), icon: 'fa-solid fa-tag' },
      ...this.facts(item).map(f => ({ key: f.key, label: f.label, value: f.value, icon: f.icon })),
      ...this.features(item).map(k => ({ key: k, label: this.featureMeta[k].label, value: 'Yes', icon: this.featureMeta[k].icon })),
    ];
    return rows;
  }
  verifiedCount(item: OwnerSubmission): number { return this.checklist(item).filter(r => item.verification?.[r.key] === true).length; }

  verify(key: string, value: boolean): void {
    if (!this.selected) return;
    const current = this.selected.verification?.[key];
    const next = { ...(this.selected.verification || {}) };
    if (current === value) delete next[key]; else next[key] = value;
    this.selected.verification = next; this.saved = false;
  }

  save(status?: OwnerSubmissionStatus): void {
    if (!this.selected || this.saving) return;
    this.saving = true; this.saved = false;
    this.service.updateSubmission(this.selected.id, { status: status || this.selected.status, verification: this.selected.verification, agentNotes: this.selected.agentNotes || '' }).subscribe({
      next: updated => {
        this.selected = updated;
        const index = this.submissions.findIndex(x => x.id === updated.id);
        if (index >= 0) this.submissions[index] = updated;
        this.saving = false; this.saved = true;
      },
      error: () => { this.error = 'Could not save the submission.'; this.saving = false; },
    });
  }

  createListing(): void { if (this.selected) this.router.navigate(['/upload-apartment'], { queryParams: { owner: this.selected.id } }); }

  openPhoto(index: number): void { this.lightbox = index; }
  movePhoto(step: number): void {
    if (this.lightbox === null || !this.selected) return;
    const n = this.selected.photos.length;
    this.lightbox = (this.lightbox + step + n) % n;
  }
  @HostListener('document:keydown', ['$event']) onKey(event: KeyboardEvent): void {
    if (this.lightbox === null) return;
    if (event.key === 'Escape') this.lightbox = null;
    if (event.key === 'ArrowRight') this.movePhoto(1);
    if (event.key === 'ArrowLeft') this.movePhoto(-1);
  }
}
