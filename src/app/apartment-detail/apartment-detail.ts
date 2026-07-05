import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Apartment } from '../models/apartment';
import { ApartmentService } from '../services/apartment.service';

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
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {
    this.mapUrl = this.createMapUrl('Gia Chanturia St. 8, Tbilisi, Georgia');
  }

  ngOnInit(): void {
    const apartmentId = Number(this.route.snapshot.paramMap.get('id') || 0);

    if (apartmentId) {
      this.loadApartment(apartmentId);
    } else {
      this.applyApartment(this.createFallbackApartment());
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
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Apartment detail API error:', err);
        this.applyApartment(this.createFallbackApartment(id));
        this.loading = false;
        this.errorMessage = 'Showing preview details while the apartment API is unavailable.';
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

        this.similarApartments = nearby.length ? nearby : this.createFallbackSimilarApartments();
        this.cdr.detectChanges();
      },
      error: () => {
        this.similarApartments = this.createFallbackSimilarApartments();
        this.cdr.detectChanges();
      },
    });
  }

  get title(): string {
    return this.apartment?.title || 'One bedroom apartment in Tbilisi, Georgia';
  }

  get address(): string {
    return this.apartment?.address || 'Gia Chanturia St. 8';
  }

  get cityLine(): string {
    const address = this.address;
    return address.includes(',') ? address.split(',')[0].trim() : 'Tbilisi, Georgia';
  }

  get price(): number {
    return this.apartment?.price || 1880;
  }

  get description(): string {
    return (
      this.apartment?.description ||
      'Step inside and experience high-end finishes, from sleek hardwood floors to custom cabinetry. Our apartments boast open-concept living spaces, allowing for a seamless flow from the kitchen to the living room. Large windows fill your home with natural light, and many units include private balconies or patios.'
    );
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

  private applyApartment(apartment: Apartment): void {
    this.apartment = apartment;
    this.mapUrl = this.createMapUrl(this.address);
    this.galleryImages = this.getApartmentImages(apartment);
  }

  private toSimilarApartment(apartment: Apartment, index: number): SimilarApartment {
    return {
      title: this.getLocation(apartment),
      address: apartment.address || 'Gia Chanturia St. 8',
      distance: `${index + 3}.${apartment.id % 10} kilometers away`,
      price: apartment.price,
      rating: Math.min(4.8 + (apartment.id % 5) * 0.04, 5).toFixed(2),
      imageUrl: apartment.imageUrls?.[0] || apartment.imageUrl || this.galleryImages[index % this.galleryImages.length],
    };
  }

  private getLocation(apartment: Apartment): string {
    const address = apartment.address?.trim();
    if (!address) return apartment.title || 'Tbilisi, Georgia';
    return address.split(',')[0].trim() || address;
  }

  private createFallbackApartment(id = 1): Apartment {
    return {
      id,
      title: 'One bedroom apartment in Tbilisi, Georgia',
      description: this.description,
      price: 1880,
      address: 'Gia Chanturia St. 8, Tbilisi, Georgia',
      imageUrl: '/banner.jpg',
      imageUrls: ['/banner.jpg', '/agent2.jpg', '/Career.jpg', '/agent3.jpg', '/banner.jpg'],
      createdAt: new Date().toISOString(),
    };
  }

  private getApartmentImages(apartment: Apartment): string[] {
    const uploadedImages = (apartment.imageUrls || []).filter(Boolean);

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

    this.realPhotoCount = apartment.imageUrl ? 1 : 5;
    return [
      apartment.imageUrl || '/banner.jpg',
      '/agent2.jpg',
      '/Career.jpg',
      '/agent3.jpg',
      apartment.imageUrl || '/banner.jpg',
    ];
  }

  private createFallbackSimilarApartments(): SimilarApartment[] {
    return [
      {
        title: 'Tbilisi, Georgia',
        address: 'Mikheil Tamarashvili St. 26',
        distance: '6.5 kilometers away',
        price: 1680,
        rating: '4.65',
        imageUrl: '/banner.jpg',
      },
      {
        title: 'Kutaisi, Georgia',
        address: 'Akaki Tsereteli St. 37',
        distance: '302 kilometers away',
        price: 980,
        rating: '4.80',
        imageUrl: '/agent2.jpg',
      },
      {
        title: 'Tbilisi, Georgia',
        address: 'Gia Chanturia St. 8',
        distance: '7 kilometers away',
        price: 2300,
        rating: '4.98',
        imageUrl: '/Career.jpg',
      },
      {
        title: 'Tbilisi, Georgia',
        address: 'Baktrioni St. 22',
        distance: '5.3 kilometers away',
        price: 1880,
        rating: '5.00',
        imageUrl: '/agent3.jpg',
      },
    ];
  }

  private createMapUrl(query: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=15&ie=UTF8&iwloc=&output=embed`
    );
  }
}
