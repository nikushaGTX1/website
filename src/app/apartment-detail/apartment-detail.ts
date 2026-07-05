import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Apartment } from '../models/apartment';
import { Agent } from '../models/agent';
import { AgentService } from '../services/agent.service';
import { ApartmentService } from '../services/apartment.service';
import { toMediaUrl } from '../utils/api-media';

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
  mapUrl: SafeResourceUrl;

  loading = false;
  errorMessage = '';

  galleryImages = ['/banner.jpg', '/agent2.jpg', '/Career.jpg', '/agent3.jpg', '/banner.jpg'];
  private realPhotoCount = 5;

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
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {
    this.mapUrl = this.createMapUrl('Tbilisi, Georgia');
  }

  ngOnInit(): void {
    const apartmentId = Number(this.route.snapshot.paramMap.get('id') || 0);

    if (apartmentId) {
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
        this.loadApartmentAgent(apartment);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Apartment detail API error:', err);
        this.apartment = null;
        this.selectedAgent = null;
        this.galleryImages = this.getPlaceholderImages();
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

  get agentName(): string {
    return this.selectedAgent
      ? this.selectedAgent.fullName || this.selectedAgent.name || this.selectedAgent.userName || this.selectedAgent.email || 'Agent'
      : this.apartment?.agentName || this.apartment?.uploadedByName || this.apartment?.ownerName || 'Agent information unavailable';
  }

  get agentRole(): string {
    return this.selectedAgent || this.apartment?.agentName || this.apartment?.uploadedByName
      ? 'Real estate professional'
      : 'No agent connected to this apartment';
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
    const rating = this.selectedAgent?.averageRating || this.selectedAgent?.rating;
    return rating ? rating.toFixed(2) : 'No rating';
  }

  get agentBio(): string {
    return this.selectedAgent?.bio || 'This apartment has no agent profile connected by the API yet.';
  }

  get agentExperience(): string {
    const deals = this.selectedAgent?.closedDeals;
    return deals
      ? `${this.agentName} has closed ${deals} deal${deals === 1 ? '' : 's'} on the platform.`
      : 'Agent experience details will appear here when the API returns them.';
  }

  private applyApartment(apartment: Apartment): void {
    this.apartment = apartment;
    this.mapUrl = this.createMapUrl(this.address);
    this.galleryImages = this.getApartmentImages(apartment);
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
    ].filter((value): value is string => !!value);
    const ownerEmails = [
      apartment.userEmail,
      apartment.createdByEmail,
      apartment.agentEmail,
      apartment.uploadedByEmail,
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
            .filter((value): value is string => !!value)
            .map((value) => value.toLowerCase());
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
      imageUrl: toMediaUrl(apartment.imageUrls?.[0] || apartment.imageUrl) || '/banner.jpg',
    };
  }

  private getLocation(apartment: Apartment): string {
    const address = apartment.address?.trim();
    if (!address) return apartment.title || 'Tbilisi, Georgia';
    return address.split(',')[0].trim() || address;
  }

  private getApartmentImages(apartment: Apartment): string[] {
    const uploadedImages = (apartment.imageUrls || []).map((image) => toMediaUrl(image)).filter(Boolean);
    const singleImage = toMediaUrl(apartment.imageUrl);

    if (uploadedImages.length) {
      this.realPhotoCount = Math.min(uploadedImages.length, 15);
      return [
        ...uploadedImages.slice(0, 15),
        '/banner.jpg',
        '/agent2.jpg',
        '/Career.jpg',
        '/agent3.jpg',
      ].slice(0, Math.max(5, Math.min(uploadedImages.length, 15)));
    }

    this.realPhotoCount = singleImage ? 1 : 0;
    return singleImage
      ? [singleImage, ...this.getPlaceholderImages()].slice(0, 5)
      : this.getPlaceholderImages();
  }

  private getPlaceholderImages(): string[] {
    return ['/banner.jpg', '/banner.jpg', '/banner.jpg', '/banner.jpg', '/banner.jpg'];
  }

  private createMapUrl(query: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=15&ie=UTF8&iwloc=&output=embed`
    );
  }
}
