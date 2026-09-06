import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Apartment } from '../models/apartment';
import { Agent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { ApartmentService } from '../services/apartment.service';
import { FavoriteService } from '../services/favorite.service';
import { AuthService } from '../services/auth.service';
import { CrmService } from '../services/crm.service';
import { toMediaUrl } from '../utils/api-media';
import { NearbyPlace } from '../maps/google-property-map/google-property-map.component';
import { AppLanguage, TranslationService } from '../services/translation.service';
import { SeoService } from '../services/seo.service';

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

interface ViewingInquiryForm {
  name: string;
  email: string;
  phone: string;
  requestedViewingAt: string;
  message: string;
  consentToContact: boolean;
  website: string;
}

@Component({
  selector: 'app-apartment-detail',
  standalone: false,
  templateUrl: './apartment-detail.html',
  styleUrls: ['./apartment-detail.css', './apartment-detail.icons.css'],
})
export class ApartmentDetail implements OnInit, OnDestroy {
  @ViewChild('viewingDialog') private viewingDialog?: ElementRef<HTMLElement>;

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
  private agentImageIndex = 0;
  nearbyPlaces: NearbyPlace[] = [];
  viewingDialogOpen = false;
  inquirySubmitting = false;
  inquirySubmitted = false;
  inquiryError = '';
  inquiryForm: ViewingInquiryForm = this.emptyInquiryForm();
  private realPhotoCount = 0;
  private previouslyFocusedElement: HTMLElement | null = null;

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
    private crmService: CrmService,
    private seoService: SeoService,
    readonly translation: TranslationService,
  ) {}

  ngOnInit(): void {
    const apartmentId = Number(
      this.route.snapshot.paramMap.get('id') || this.route.snapshot.queryParamMap.get('id') || 0,
    );

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
        this.seoService.updateApartment(apartment);
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
    const sourceTitle = this.apartment?.title?.trim() || '';
    const language = this.translation.language$.value;
    if (language === 'ka' || (language === 'en' && !this.hasGeorgianText(sourceTitle))) {
      return sourceTitle || 'Apartment details unavailable';
    }

    const place = this.localizedPlace(language);
    const forSale = this.isForSale;
    if (language === 'ru') {
      return `${this.localizedPropertyType('ru')} ${forSale ? 'на продажу' : 'в аренду'} — ${place}`;
    }
    return `${this.localizedPropertyType('en')} for ${forSale ? 'sale' : 'rent'} in ${place}`;
  }

  hasGeorgianText(value: string): boolean {
    return /[\u10A0-\u10FF]/.test(value);
  }

  get address(): string {
    const language = this.translation.language$.value;
    const apartment = this.apartment;
    const source =
      apartment?.address?.trim() ||
      [
        apartment?.street?.trim(),
        apartment?.district?.trim(),
        apartment?.city?.trim(),
      ]
        .filter((value, index, values): value is string => !!value && values.indexOf(value) === index)
        .join(', ');
    if (!source)
      return language === 'ru'
        ? 'Адрес не указан'
        : language === 'ka'
          ? 'მისამართი არ არის მითითებული'
          : 'Address not provided';
    return this.localizedPlace(language, source);
  }

  get cityLine(): string {
    const address = this.address;
    return address.includes(',')
      ? address.split(',')[0].trim()
      : address === 'Address not provided' || address === 'მისამართი არ არის მითითებული' || address === 'Адрес не указан'
        ? 'Tbilisi, Georgia'
        : address;
  }

  get price(): number {
    return this.apartment?.price || 0;
  }

  get listingType(): string {
    const language = this.translation.language$.value;
    if (language === 'ru') return this.isForSale ? 'Продажа' : 'Аренда';
    if (language === 'ka') return this.isForSale ? 'იყიდება' : 'ქირავდება';
    return this.isForSale ? 'For sale' : 'For rent';
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

  get rooms(): number {
    return this.apartment?.rooms || 0;
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
    return floor === undefined || floor === null
      ? '—'
      : `${floor}${this.ordinalSuffix(floor)} floor`;
  }

  get buildingType(): string {
    return this.apartment?.apartmentStyle || 'Apartment';
  }

  get phoneNumber(): string {
    return (
      this.apartment?.agentPhoneNumber?.trim() ||
      this.apartment?.phoneNumber?.trim() ||
      this.getListingMetadata('Phone') ||
      this.selectedAgent?.phoneNumber?.trim() ||
      ''
    );
  }

  get canViewOwnerContact(): boolean {
    return this.authService.hasAnyRole(['agent', 'manager', 'crm-manager', 'crm_manager', 'admin']);
  }

  get ownerName(): string {
    return this.canViewOwnerContact ? this.apartment?.ownerName?.trim() || '' : '';
  }

  get ownerPhoneNumber(): string {
    return this.canViewOwnerContact ? this.apartment?.ownerPhoneNumber?.trim() || '' : '';
  }

  get maskedPhoneNumber(): string {
    const phone = this.phoneNumber;
    if (!phone) return '';
    const visibleDigits = phone.replace(/\D/g, '').slice(-2);
    return `••• ••• ••${visibleDigits ? ` ${visibleDigits}` : ''}`;
  }

  get visibleDescription(): string {
    const clean = this.description.split(/\r?\n\s*\r?\n(?:Listing plan|Type):/i)[0].trim();
    const language = this.translation.language$.value;
    if (language === 'ru' || (language === 'en' && this.hasGeorgianText(clean))) {
      return this.generatedDescription(language);
    }
    return this.descriptionExpanded || clean.length <= 360
      ? clean
      : `${clean.slice(0, 360).trim()}…`;
  }

  get isExclusiveListing(): boolean {
    return this.getListingMetadata('Listing plan').toLowerCase() === 'velven exclusive';
  }

  get keyFeatures(): Array<{ icon: string; label: string; value: string }> {
    const apartment = this.apartment;
    if (!apartment) return [];
    return [
      { icon: 'fa-car', label: 'Private parking', value: this.yesNo(apartment.hasParking) },
      { icon: 'fa-building', label: 'Balcony', value: this.yesNo(apartment.hasBalcony) },
      { icon: 'fa-couch', label: 'Furnished', value: this.yesNo(apartment.isFurnished) },
      {
        icon: 'fa-snowflake',
        label: 'Air conditioning',
        value: this.yesNo(apartment.hasAirConditioning),
      },
      { icon: 'fa-elevator', label: 'Elevator', value: this.yesNo(apartment.hasElevator) },
      { icon: 'fa-paw', label: 'Pet-friendly', value: this.yesNo(apartment.isPetFriendly) },
      { icon: 'fa-bath', label: 'Bathtub', value: this.yesNo(apartment.hasBathtub) },
      { icon: 'fa-utensils', label: 'Dishwasher', value: this.yesNo(apartment.hasDishwasher) },
      {
        icon: 'fa-briefcase',
        label: 'Home office',
        value: this.yesNo(apartment.hasHomeOfficeSpace),
      },
      {
        icon: 'fa-kitchen-set',
        label: 'Large kitchen',
        value: this.yesNo(apartment.hasLargeKitchen),
      },
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
    document.body.classList.add('photo-viewer-active');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-viewer-photo="${this.activePhotoIndex}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
  }

  closePhotoViewer(): void {
    this.photoViewerOpen = false;
    document.body.classList.remove('photo-viewer-active');
    document.body.style.overflow = '';
  }

  ngOnDestroy(): void {
    document.body.classList.remove('photo-viewer-active');
    document.body.style.overflow = '';
  }

  preventImageAction(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  updateActiveViewerPhoto(event: Event): void {
    const viewer = event.currentTarget as HTMLElement;
    const viewerCenter = viewer.getBoundingClientRect().top + viewer.clientHeight / 2;
    const photos = Array.from(viewer.querySelectorAll<HTMLElement>('[data-viewer-photo]'));
    const closest = photos.reduce<{ index: number; distance: number }>(
      (result, photo) => {
        const rect = photo.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - viewerCenter);
        const index = Number(photo.dataset['viewerPhoto']);
        return distance < result.distance ? { index, distance } : result;
      },
      { index: this.activePhotoIndex, distance: Number.POSITIVE_INFINITY },
    );
    this.activePhotoIndex = closest.index;
  }

  toggleFavorite(): void {
    if (!this.apartment) return;
    if (!this.authService.isLoggedIn) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: `/apartments/${this.apartment.id}` },
      });
      return;
    }

    const previous = this.favorite;
    this.favorite = !previous;
    this.cdr.detectChanges();

    this.favoriteService.toggleFavorite(this.apartment.id).subscribe({
      next: (favorite) => {
        this.favorite = favorite;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.favorite = previous;
        this.cdr.detectChanges();
        console.error('Favorite API error:', error);
      },
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
    window.open(
      phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`,
      '_blank',
      'noopener',
    );
  }

  scheduleViewing(): void {
    this.previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const user = this.authService.currentUser;
    this.inquiryForm = {
      ...this.emptyInquiryForm(),
      name: user?.fullName || user?.userName || '',
      email: user?.email || '',
      phone: user?.phoneNumber || '',
      message: `I would like to schedule a viewing for ${this.title}.`,
    };
    this.inquiryError = '';
    this.inquirySubmitted = false;
    this.viewingDialogOpen = true;
    setTimeout(() => this.focusInitialControl(this.viewingDialog?.nativeElement));
  }

  closeViewingDialog(): void {
    if (this.inquirySubmitting) return;
    const focusTarget = this.previouslyFocusedElement;
    this.viewingDialogOpen = false;
    this.inquiryError = '';
    this.inquirySubmitted = false;
    this.previouslyFocusedElement = null;
    setTimeout(() => focusTarget?.focus());
  }

  submitViewingRequest(): void {
    if (!this.apartment || this.inquirySubmitting) return;

    const name = this.inquiryForm.name.trim();
    const email = this.inquiryForm.email.trim();
    const phone = this.inquiryForm.phone.trim();
    const requestedViewingAt = this.toIsoDate(this.inquiryForm.requestedViewingAt);

    if (!name) {
      this.inquiryError = 'Please enter your name.';
      return;
    }
    if (!email && !phone) {
      this.inquiryError = 'Add an email address or phone number.';
      return;
    }
    if (!requestedViewingAt || Date.parse(requestedViewingAt) <= Date.now()) {
      this.inquiryError = 'Choose a future date and time for the viewing.';
      return;
    }
    if (!this.inquiryForm.consentToContact) {
      this.inquiryError = 'Please confirm that Velven may contact you about this property.';
      return;
    }

    this.inquirySubmitting = true;
    this.inquiryError = '';
    this.crmService
      .submitInquiry({
        apartmentId: this.apartment.id,
        name,
        email: email || undefined,
        phone: phone || undefined,
        requestedViewingAt,
        message: this.inquiryForm.message.trim() || undefined,
        consentToContact: true,
        website: this.inquiryForm.website,
      })
      .subscribe({
        next: () => {
          this.inquirySubmitting = false;
          this.inquirySubmitted = true;
          this.cdr.detectChanges();
          setTimeout(() => this.focusInitialControl(this.viewingDialog?.nativeElement));
        },
        error: (error: HttpErrorResponse) => {
          this.inquirySubmitting = false;
          this.inquiryError =
            error.status === 429
              ? 'Too many requests were sent. Please wait a few minutes and try again.'
              : error.error?.message || 'Your request could not be sent. Please try again.';
          this.cdr.detectChanges();
        },
      });
  }

  get minimumViewingDate(): string {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  @HostListener('document:keydown', ['$event'])
  handleDialogKeydown(event: KeyboardEvent): void {
    if (this.photoViewerOpen && event.key === 'Escape') {
      event.preventDefault();
      this.closePhotoViewer();
      return;
    }

    if (!this.viewingDialogOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeViewingDialog();
      return;
    }

    if (event.key === 'Tab') {
      this.trapDialogFocus(event, this.viewingDialog?.nativeElement);
    }
  }

  private focusInitialControl(dialog?: HTMLElement): void {
    if (!dialog) return;
    const preferred = dialog.querySelector<HTMLElement>('[data-initial-focus]');
    (preferred || this.focusableElements(dialog)[0] || dialog).focus();
  }

  private trapDialogFocus(event: KeyboardEvent, dialog?: HTMLElement): void {
    if (!dialog) return;
    const focusable = this.focusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(dialog: HTMLElement): HTMLElement[] {
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
  }

  openMaps(): void {
    const destination =
      Number.isFinite(this.apartment?.propertyLatitude ?? this.apartment?.latitude) &&
      Number.isFinite(this.apartment?.propertyLongitude ?? this.apartment?.longitude)
        ? `${this.apartment!.propertyLatitude ?? this.apartment!.latitude},${this.apartment!.propertyLongitude ?? this.apartment!.longitude}`
        : this.address;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
      '_blank',
      'noopener',
    );
  }

  openWalkingDirections(place: NearbyPlace): void {
    const origin =
      Number.isFinite(this.apartment?.propertyLatitude ?? this.apartment?.latitude) &&
      Number.isFinite(this.apartment?.propertyLongitude ?? this.apartment?.longitude)
        ? `${this.apartment!.propertyLatitude ?? this.apartment!.latitude},${this.apartment!.propertyLongitude ?? this.apartment!.longitude}`
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

  get storedNearbyPlaces(): Array<{ label: string; icon: string; minutes: number }> {
    const apartment = this.apartment;
    if (!apartment) return [];
    const places = [
      { label: 'Nearest metro', icon: 'fa-train-subway', minutes: apartment.metroDistanceMinutes },
      {
        label: 'Nearest school',
        icon: 'fa-graduation-cap',
        minutes: apartment.schoolDistanceMinutes,
      },
      { label: 'Nearest gym', icon: 'fa-dumbbell', minutes: apartment.gymDistanceMinutes },
      { label: 'Nearest park', icon: 'fa-tree', minutes: apartment.parkDistanceMinutes },
      {
        label: 'Nearest kindergarten',
        icon: 'fa-children',
        minutes: apartment.kindergartenDistanceMinutes,
      },
      {
        label: 'Nearest university',
        icon: 'fa-building-columns',
        minutes: apartment.universityDistanceMinutes,
      },
    ];
    return places.filter((place): place is { label: string; icon: string; minutes: number } =>
      Number.isFinite(place.minutes),
    );
  }

  viewSimilar(index: number): void {
    const apartment = this.apartment;
    this.apartmentService.getApartments().subscribe((apartments) => {
      const target = apartments.filter((item) => item.id !== apartment?.id)[index];
      if (target) void this.router.navigate(['/apartments', target.id]);
    });
  }

  get agentName(): string {
    return (
      this.apartment?.agentName?.trim() ||
      (this.selectedAgent
        ? this.selectedAgent.fullName ||
          this.selectedAgent.name ||
          this.selectedAgent.userName ||
          this.selectedAgent.email ||
          'Agent'
        : this.apartment?.uploadedByName ||
          this.apartment?.ownerName ||
          this.getListingMetadata('Contact') ||
          this.getListingMetadata('Owner Email') ||
          'Listing agent')
    );
  }

  get agentProfileId(): string {
    return String(
      this.selectedAgent?.id ||
        this.selectedAgent?.userId ||
        this.apartment?.uploadedByUserId ||
        this.apartment?.uploaderUserId ||
        this.apartment?.uploadedById ||
        this.apartment?.agentUserId ||
        this.apartment?.agentId ||
        '',
    );
  }

  get agentRole(): string {
    return this.selectedAgent ? 'Real estate professional' : 'Property uploader';
  }

  get agentLocation(): string {
    return this.selectedAgent?.location || this.apartment?.address || '';
  }

  get agentImage(): string {
    return this.agentImageCandidates[this.agentImageIndex] || '';
  }

  private get agentImageCandidates(): string[] {
    const candidates = [
      this.selectedAgent?.profilePictureUrl,
      this.selectedAgent?.profilePicture,
      this.selectedAgent?.avatarUrl,
      this.apartment?.agentProfilePictureUrl,
      this.apartment?.agentProfilePicture,
      this.apartment?.uploaderProfilePictureUrl,
      this.apartment?.uploaderProfilePicture,
      this.apartment?.uploadedByProfilePictureUrl,
      this.apartment?.uploadedByProfilePicture,
      this.apartment?.profilePictureUrl,
      this.apartment?.profilePicture,
      this.currentUploaderProfilePicture,
    ]
      .map((value) => toMediaUrl(value))
      .filter((value): value is string => !!value);
    return [...new Set(candidates)];
  }

  private get currentUploaderProfilePicture(): string | undefined {
    const user = this.authService.currentUser;
    if (!user || !this.apartment) return undefined;
    const userId = String(user.id || '').toLowerCase();
    const uploaderIds = [
      this.apartment.userId,
      this.apartment.ownerId,
      this.apartment.createdById,
      this.apartment.applicationUserId,
      this.apartment.agentId,
      this.apartment.agentUserId,
      this.apartment.uploadedById,
      this.apartment.uploadedByUserId,
      this.apartment.uploaderUserId,
    ].map((value) => String(value || '').toLowerCase());
    const uploaderEmails = [
      this.apartment.userEmail,
      this.apartment.createdByEmail,
      this.apartment.agentEmail,
      this.apartment.uploadedByEmail,
    ].map((value) => String(value || '').toLowerCase());
    const isUploader =
      (!!userId && uploaderIds.includes(userId)) ||
      uploaderEmails.includes(user.email.toLowerCase());
    return isUploader ? user.profilePictureUrl || user.profilePicture : undefined;
  }

  get agentInitials(): string {
    const parts = this.agentName.trim().split(/\s+/).filter(Boolean);
    const initials =
      parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || 'U';
    return initials.toUpperCase();
  }

  handleAgentImageError(): void {
    this.agentImageIndex += 1;
    this.cdr.detectChanges();
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
    this.agentImageIndex = 0;
    this.galleryImages = this.getApartmentImages(apartment);
  }

  private emptyInquiryForm(): ViewingInquiryForm {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    return {
      name: '',
      email: '',
      phone: '',
      requestedViewingAt: localDate,
      message: '',
      consentToContact: false,
      website: '',
    };
  }

  private toIsoDate(value: string): string | undefined {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private yesNo(value?: boolean): string {
    return value ? 'Yes' : 'No';
  }

  private get isForSale(): boolean {
    const metadata =
      `${this.getListingMetadata('Deal')} ${this.getListingMetadata('Listing type')}`.toLowerCase();
    return metadata.includes('sale') || metadata.includes('buy');
  }

  private localizedPropertyType(language: 'en' | 'ru'): string {
    const type =
      `${this.getListingMetadata('Type')} ${this.apartment?.apartmentStyle || ''}`.toLowerCase();
    const house = type.includes('house') || type.includes('villa') || type.includes('cottage');
    return language === 'ru' ? (house ? 'Дом' : 'Квартира') : house ? 'House' : 'Apartment';
  }

  private localizedPlace(language: AppLanguage, fallback?: string): string {
    const source =
      fallback || this.apartment?.district?.trim() || this.apartment?.address?.trim() || 'Tbilisi';
    const places: Record<string, { en: string; ka: string; ru: string }> = {
      tbilisi: { en: 'Tbilisi', ka: 'თბილისი', ru: 'Тбилиси' },
      vake: { en: 'Vake', ka: 'ვაკე', ru: 'Ваке' },
      saburtalo: { en: 'Saburtalo', ka: 'საბურთალო', ru: 'Сабуртало' },
      vera: { en: 'Vera', ka: 'ვერა', ru: 'Вера' },
      mtatsminda: { en: 'Mtatsminda', ka: 'მთაწმინდა', ru: 'Мтацминда' },
    };
    return places[source.toLowerCase()]?.[language] || fallback || source;
  }

  private generatedDescription(language: 'en' | 'ru'): string {
    const place = this.localizedPlace(language);
    const propertyType = this.localizedPropertyType(language).toLowerCase();
    const bedroomCount = this.bedrooms;
    const bathroomCount = this.bathrooms;
    if (language === 'ru') {
      const facts = [
        bedroomCount ? `${bedroomCount} спальн.` : '',
        bathroomCount ? `${bathroomCount} ванн.` : '',
        this.area ? `${this.area} м²` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `Проверенный объект (${propertyType}) в районе ${place}.${facts ? ` ${facts}.` : ''} Свяжитесь с VELVEN, чтобы уточнить доступность и договориться о просмотре.`;
    }
    const facts = [
      bedroomCount ? `${bedroomCount} bedroom${bedroomCount === 1 ? '' : 's'}` : '',
      bathroomCount ? `${bathroomCount} bathroom${bathroomCount === 1 ? '' : 's'}` : '',
      this.area ? `${this.area} m²` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return `Verified ${propertyType} in ${place}.${facts ? ` ${facts}.` : ''} Contact VELVEN to confirm availability and arrange a viewing.`;
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
      apartment.uploadedByUserId,
      apartment.uploaderUserId,
      this.getListingMetadata('Owner ID'),
      this.getListingMetadata('Uploader ID'),
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
        this.selectedAgent =
          agents.find((agent) => {
            const agentIds = [agent.id, agent.userId]
              .filter((value) => value !== undefined && value !== null)
              .map((value) => String(value).toLowerCase());
            const agentEmail = agent.email?.toLowerCase();

            return (
              ownerIds.some((ownerId) => agentIds.includes(ownerId.toLowerCase())) ||
              (!!agentEmail && ownerEmails.includes(agentEmail))
            );
          }) || null;
        this.agentImageIndex = 0;
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
        toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) || '/property-placeholder.svg',
    };
  }

  private getLocation(apartment: Apartment): string {
    const address = apartment.address?.trim();
    if (!address) return apartment.title || 'Tbilisi, Georgia';
    return address.split(',')[0].trim() || address;
  }

  private getListingMetadata(label: string): string {
    const description = this.apartment?.description || '';
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (
      description
        .match(new RegExp(`(?:^|[|\\r\\n])\\s*${escapedLabel}:\\s*([^|\\r\\n]+)`, 'i'))?.[1]
        ?.trim() || ''
    );
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
