import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Apartment } from '../models/apartment';
import { Agent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { ApartmentService } from '../services/apartment.service';
import { FavoriteService } from '../services/favorite.service';
import { AuthService } from '../services/auth.service';
import { toMediaUrl } from '../utils/api-media';
import { NearbyPlace } from '../maps/google-property-map/google-property-map.component';

interface Review {
  name: string;
  text: string;
}

interface SimilarApartment {
  title: string;
  address: string;
  distance: string;
  price: number;
  rating: string;
  imageUrl: string;
}

@Component({
  selector: 'app-apartment-detail',
  standalone: false,
  templateUrl: './apartment-detail.html',
  styleUrl: './apartment-detail.css',
})
export class ApartmentDetail implements OnInit {
  apartment: Apartment | null = null;
  selectedAgent: Agent | null = null;
  similarApartments: SimilarApartment[] = [];

  loading = false;
  errorMessage = '';

  galleryImages: string[] = [];
  activePhotoIndex = 0;
  photoViewerOpen = false;
  favorite = false;
  phoneRevealed = false;
  descriptionExpanded = false;
  nearbyPlaces: NearbyPlace[] = [];
  private realPhotoCount = 0;

  reviews: Review[] = [
    {
      name: 'Mariam',
      text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    },
    {
      name: 'Goga',
      text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    },
    {
      name: 'Keti',
      text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    },
  ];

  constructor(
    private route: ActivatedRoute,
    private apartmentService: ApartmentService,
    private agentService: AgentService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private favoriteService: FavoriteService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const apartmentId = Number(this.route.snapshot.paramMap.get('id') || 0);

    if (apartmentId) {
      this.favoriteService.loadFavorites().subscribe({
        next: () => {
          this.favorite = this.favoriteService.isFavorite(apartmentId);
          this.cdr.detectChanges();
        },
        error: () => undefined,
      });
      this.loadApartment(apartmentId);
    } else {
      this.errorMessage = 'Open an apartment from the listings to view its details.';
    }

    this.loadSimilarApartments(apartmentId);
  }

  loadApartment(id: number): void {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.apartmentService.getApartment(id).subscribe({
      next: (apartment) => {
        this.applyApartment(apartment);
        this.favorite = this.favoriteService.isFavorite(apartment.id);
        this.loadApartmentAgent(apartment);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Apartment detail API error:', err);
        this.apartment = null;
        this.selectedAgent = null;
        this.galleryImages = [];
        this.realPhotoCount = 0;
        this.loading = false;
        this.errorMessage = 'Could not load this apartment from the API.';
        this.cdr.detectChanges();
      },
    });
  }

  loadSimilarApartments(currentId: number): void {
    this.apartmentService.getApartments().subscribe({
      next: (apartments) => {
        const nearby = apartments
          .filter((apartment) => apartment.id !== currentId)
          .slice(0, 4)
          .map((apartment, index) => this.toSimilarApartment(apartment, index));

        this.similarApartments = nearby;
        this.cdr.detectChanges();
      },
      error: () => {
        this.similarApartments = [];
        this.cdr.detectChanges();
      },
    });
  }

  get title(): string {
    return this.apartment?.title?.trim() || 'Apartment details unavailable';
  }

  get address(): string {
    return this.apartment?.address?.trim() || 'Address not provided';
  }

  get cityLine(): string {
    const address = this.address;
    return address.includes(',') ? address.split(',')[0].trim() : 'Tbilisi, Georgia';
  }

  get price(): number {
    return this.apartment?.price || 0;
  }

  get description(): string {
    return this.apartment?.description?.trim() || 'No description provided.';
  }

  get rating(): string {
    const id = this.apartment?.id || 5;
    return Math.min(4.82 + (id % 4) * 0.04, 5).toFixed(2);
  }

  get distance(): string {
    const id = this.apartment?.id || 5;
    return `${(id % 5) + 3}.${id % 10} kilometers away`;
  }

  get photoCount(): number {
    return this.realPhotoCount;
  }

  get additionalGalleryImages(): string[] {
    return this.galleryImages.slice(5);
  }

  get activePhoto(): string {
    return this.galleryImages[this.activePhotoIndex] || '/property-placeholder.svg';
  }

  get bedrooms(): number {
    return this.apartment?.bedrooms || 0;
  }

  get bathrooms(): number {
    return this.apartment?.bathrooms || 0;
  }

  get area(): number {
    return this.apartment?.sizeSquareMeters || 0;
  }

  get floorLabel(): string {
    const floor = this.apartment?.floor;
    return floor === undefined || floor === null ? '—' : `${floor}${this.ordinalSuffix(floor)} floor`;
  }

  get buildingType(): string {
    return this.apartment?.apartmentStyle || 'Apartment';
  }

  get phoneNumber(): string {
    return (
      this.apartment?.phoneNumber?.trim() ||
      this.getListingMetadata('Phone') ||
      this.selectedAgent?.phoneNumber?.trim() ||
      ''
    );
  }

  get maskedPhoneNumber(): string {
    const phone = this.phoneNumber;
    if (!phone) return '';
    const visibleDigits = phone.replace(/\D/g, '').slice(-2);
    return `••• ••• ••${visibleDigits ? ` ${visibleDigits}` : ''}`;
  }

  get visibleDescription(): string {
    const clean = this.description.split(/\n\nType:/i)[0].trim();
    return this.descriptionExpanded || clean.length <= 360
      ? clean
      : `${clean.slice(0, 360).trim()}…`;
  }

  get keyFeatures(): Array<{ icon: string; label: string; value: string }> {
    const apartment = this.apartment;
    if (!apartment) return [];
    return [
      { icon: 'fa-car', label: 'Private parking', value: this.yesNo(apartment.hasParking) },
      { icon: 'fa-building', label: 'Balcony', value: this.yesNo(apartment.hasBalcony) },
      { icon: 'fa-couch', label: 'Furnished', value: this.yesNo(apartment.isFurnished) },
      { icon: 'fa-snowflake', label: 'Air conditioning', value: this.yesNo(apartment.hasAirConditioning) },
      { icon: 'fa-elevator', label: 'Elevator', value: this.yesNo(apartment.hasElevator) },
      { icon: 'fa-paw', label: 'Pet-friendly', value: this.yesNo(apartment.isPetFriendly) },
      { icon: 'fa-bath', label: 'Bathtub', value: this.yesNo(apartment.hasBathtub) },
      { icon: 'fa-utensils', label: 'Dishwasher', value: this.yesNo(apartment.hasDishwasher) },
      { icon: 'fa-briefcase', label: 'Home office', value: this.yesNo(apartment.hasHomeOfficeSpace) },
      { icon: 'fa-kitchen-set', label: 'Large kitchen', value: this.yesNo(apartment.hasLargeKitchen) },
      { icon: 'fa-mountain-sun', label: 'View', value: this.yesNo(apartment.hasView) },
      { icon: 'fa-house', label: 'Style', value: apartment.apartmentStyle || 'Not specified' },
    ];
  }

  previousPhoto(): void {
    if (!this.galleryImages.length) return;
    this.activePhotoIndex =
      (this.activePhotoIndex - 1 + this.galleryImages.length) % this.galleryImages.length;
  }

  nextPhoto(): void {
    if (!this.galleryImages.length) return;
    this.activePhotoIndex = (this.activePhotoIndex + 1) % this.galleryImages.length;
  }

  selectPhoto(index: number): void {
    this.activePhotoIndex = index;
  }

  openPhotoViewer(): void {
    this.photoViewerOpen = true;
  }

  closePhotoViewer(): void {
    this.photoViewerOpen = false;
  }

  toggleFavorite(): void {
    if (!this.apartment) return;
    if (!this.authService.isLoggedIn) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: `/apartments/${this.apartment.id}` },
      });
      return;
    }

    this.favoriteService.toggleFavorite(this.apartment.id).subscribe({
      next: (favorite) => {
        this.favorite = favorite;
        this.cdr.detectChanges();
      },
      error: (error) => console.error('Favorite API error:', error),
    });
  }

  async shareApartment(): Promise<void> {
    const shareData = { title: this.title, text: this.address, url: location.href };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(location.href);
    this.errorMessage = 'Apartment link copied.';
  }

  openWhatsApp(): void {
    const phone = this.phoneNumber.replace(/\D/g, '');
    const message = encodeURIComponent(`Hello, I am interested in ${this.title}.`);
    window.open(phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`, '_blank', 'noopener');
  }

  scheduleViewing(): void {
    location.href = `mailto:${this.agentEmail}?subject=${encodeURIComponent(`Schedule a viewing: ${this.title}`)}&body=${encodeURIComponent(`I would like to schedule a viewing for ${this.title} at ${this.address}.`)}`;
  }

  openMaps(): void {
    const destination =
      Number.isFinite(this.apartment?.latitude) && Number.isFinite(this.apartment?.longitude)
        ? `${this.apartment!.latitude},${this.apartment!.longitude}`
        : this.address;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`, '_blank', 'noopener');
  }

  openWalkingDirections(place: NearbyPlace): void {
    const origin =
      Number.isFinite(this.apartment?.latitude) && Number.isFinite(this.apartment?.longitude)
        ? `${this.apartment!.latitude},${this.apartment!.longitude}`
        : this.address;
    const destination = `${place.location.lat()},${place.location.lng()}`;
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=walking`,
      '_blank',
      'noopener',
    );
  }

  setNearbyPlaces(places: NearbyPlace[]): void {
    const order = ['transit_station', 'school', 'gym', 'park', 'supermarket'];
    this.nearbyPlaces = order.flatMap((category) => {
      const match = places.find(
        (place) => place.category === category && place.walkingMinutes !== undefined,
      );
      return match ? [match] : [];
    });
  }

  viewSimilar(index: number): void {
    const apartment = this.apartment;
    this.apartmentService.getApartments().subscribe((apartments) => {
      const target = apartments.filter((item) => item.id !== apartment?.id)[index];
      if (target) void this.router.navigate(['/apartments', target.id]);
    });
  }

  get agentName(): string {
    return this.selectedAgent
      ? this.selectedAgent.fullName || this.selectedAgent.name || this.selectedAgent.userName || this.selectedAgent.email || 'Agent'
      : this.apartment?.agentName ||
          this.apartment?.uploadedByName ||
          this.apartment?.ownerName ||
          this.getListingMetadata('Contact') ||
          this.getListingMetadata('Owner Email') ||
          'Listing owner';
  }

  get agentRole(): string {
    return this.selectedAgent ? 'Real estate professional' : 'Property uploader';
  }

  get agentLocation(): string {
    return this.selectedAgent?.location || this.apartment?.address || '';
  }

  get agentImage(): string {
    return toMediaUrl(
      this.selectedAgent?.profilePictureUrl ||
      this.selectedAgent?.profilePicture ||
      this.selectedAgent?.avatarUrl ||
      this.apartment?.agentProfilePictureUrl ||
      this.apartment?.uploaderProfilePictureUrl
    ) || '/agent1.jpg';
  }

  get agentRating(): string {
    const rating = this.selectedAgent?.averageRating ?? this.selectedAgent?.rating;
    return rating !== undefined && rating !== null ? rating.toFixed(2) : 'Not rated yet';
  }

  get agentRatingCount(): string {
    const count = this.selectedAgent?.ratingCount;
    return count ? `(${count} review${count === 1 ? '' : 's'})` : '';
  }

  get agentBio(): string {
    return this.selectedAgent?.bio?.trim() || 'No bio has been provided yet.';
  }

  get agentEmail(): string {
    return (
      this.selectedAgent?.email?.trim() ||
      this.apartment?.agentEmail ||
      this.apartment?.uploadedByEmail ||
      this.apartment?.createdByEmail ||
      this.apartment?.userEmail ||
      this.getListingMetadata('Email') ||
      this.getListingMetadata('Owner Email')
    );
  }

  get agentExperience(): string {
    const deals = this.selectedAgent?.closedDeals;
    return deals
      ? `${this.agentName} has closed ${deals} deal${deals === 1 ? '' : 's'} on the platform.`
      : 'Agent experience details will appear here when the API returns them.';
  }

  private applyApartment(apartment: Apartment): void {
    this.apartment = apartment;
    this.phoneRevealed = false;
    this.galleryImages = this.getApartmentImages(apartment);
  }

  private yesNo(value?: boolean): string {
    return value ? 'Yes' : 'No';
  }

  private ordinalSuffix(value: number): string {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return 'th';
    if (value % 10 === 1) return 'st';
    if (value % 10 === 2) return 'nd';
    if (value % 10 === 3) return 'rd';
    return 'th';
  }

  private loadApartmentAgent(apartment: Apartment): void {
    const ownerIds = [
      apartment.userId,
      apartment.ownerId,
      apartment.createdById,
      apartment.applicationUserId,
      apartment.agentId,
      apartment.agentUserId,
      apartment.uploadedById,
      this.getListingMetadata('Owner ID'),
    ].filter((value): value is string => !!value);
    const ownerEmails = [
      apartment.userEmail,
      apartment.createdByEmail,
      apartment.agentEmail,
      apartment.uploadedByEmail,
      this.getListingMetadata('Owner Email'),
      this.getListingMetadata('Email'),
    ]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase());

    if (!ownerIds.length && !ownerEmails.length) {
      this.selectedAgent = null;
      return;
    }

    this.agentService.getAgents().subscribe({
      next: (agents) => {
        this.selectedAgent = agents.find((agent) => {
          const agentIds = [agent.id, agent.userId]
            .filter((value) => value !== undefined && value !== null)
            .map((value) => String(value).toLowerCase());
          const agentEmail = agent.email?.toLowerCase();

          return (
            ownerIds.some((ownerId) => agentIds.includes(ownerId.toLowerCase())) ||
            (!!agentEmail && ownerEmails.includes(agentEmail))
          );
        }) || null;
        this.cdr.detectChanges();
      },
      error: () => {
        this.selectedAgent = null;
        this.cdr.detectChanges();
      },
    });
  }

  private toSimilarApartment(apartment: Apartment, index: number): SimilarApartment {
    return {
      title: this.getLocation(apartment),
      address: apartment.address || 'Address not provided',
      distance: `${index + 3}.${apartment.id % 10} kilometers away`,
      price: apartment.price,
      rating: Math.min(4.8 + (apartment.id % 5) * 0.04, 5).toFixed(2),
      imageUrl:
        toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) ||
        '/property-placeholder.svg',
    };
  }

  private getLocation(apartment: Apartment): string {
    const address = apartment.address?.trim();
    if (!address) return apartment.title || 'Tbilisi, Georgia';
    return address.split(',')[0].trim() || address;
  }

  private getListingMetadata(label: string): string {
    const description = this.apartment?.description || '';
    const metadata = description.split(/\n\n/).slice(1).join(' | ');
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return metadata.match(new RegExp(`(?:^|\\|)\\s*${escapedLabel}:\\s*([^|]+)`, 'i'))?.[1]?.trim() || '';
  }

  private getApartmentImages(apartment: Apartment): string[] {
    const images = [...(apartment.imageUrls || []), apartment.imageUrl]
      .map((image) => toMediaUrl(image))
      .filter((image): image is string => !!image);
    const uniqueImages = [...new Set(images)].slice(0, 15);

    this.realPhotoCount = uniqueImages.length;
    return uniqueImages;
  }

}
