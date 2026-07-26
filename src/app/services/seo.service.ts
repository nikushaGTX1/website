import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

interface SeoPage {
  title: string;
  description: string;
  robots?: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly origin = 'https://website-production-ab09.up.railway.app';
  private readonly pages: Record<string, SeoPage> = {
    '/main': {
      title: 'Verified Apartments for Rent in Tbilisi | White Tower',
      description: 'Find verified apartments for rent in Tbilisi with accurate prices, trusted listings, local agents and personalized AI home matching.',
    },
    '/ExploreProperty': {
      title: 'Apartments for Rent and Sale in Tbilisi | White Tower',
      description: 'Browse verified Tbilisi apartments by location, price, bedrooms and amenities. Compare trusted listings and find your next home.',
    },
    '/agent-profile': {
      title: 'Trusted Real Estate Agents in Tbilisi | White Tower',
      description: 'Meet experienced Tbilisi real estate agents who can help you rent, buy or list a verified property with confidence.',
    },
    '/blog': {
      title: 'Tbilisi Real Estate Guides and Insights | White Tower',
      description: 'Read practical guides about renting, buying, neighborhoods and property trends in Tbilisi, Georgia.',
    },
    '/ai-home-match': {
      title: 'AI Home Matcher for Tbilisi Apartments | White Tower',
      description: 'Create a personalized home profile and discover Tbilisi apartments matched to your budget, commute and lifestyle.',
    },
    '/find-my-home': {
      title: 'Find My Home in Tbilisi | White Tower',
      description: 'Tell us what matters to you and get personalized Tbilisi apartment recommendations for your needs and lifestyle.',
    },
    '/about': {
      title: 'About White Tower | Tbilisi Real Estate Platform',
      description: 'Learn how White Tower makes apartment searches in Tbilisi clearer with verified listings, local expertise and smart matching.',
    },
    '/services': {
      title: 'Real Estate Services in Tbilisi | White Tower',
      description: 'Explore professional property search, listing and real estate support services for renters, buyers and owners in Tbilisi.',
    },
    '/upload-apartment': {
      title: 'List Your Property in Tbilisi | White Tower',
      description: 'Submit your Tbilisi apartment for review and connect with serious renters and buyers.',
      robots: 'noindex, nofollow',
    },
    '/login': {
      title: 'Sign In | White Tower',
      description: 'Sign in to manage your White Tower profile, listings and saved Tbilisi properties.',
      robots: 'noindex, nofollow',
    },
  };

  constructor(
    private readonly router: Router,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  start(): void {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.update(event.urlAfterRedirects));
    this.update(this.router.url);
  }

  private update(rawUrl: string): void {
    const path = rawUrl.split('?')[0].replace(/\/+$/, '') || '/main';
    const isApartment = /^\/apartments\/[^/]+$/.test(path);
    const isPrivate = /^\/(admin|my-profile|my-listings|saved-listings|premium|balance|payment-methods|my-business)/.test(path);
    const page = this.pages[path] || (isApartment
      ? {
          title: 'Apartment for Rent in Tbilisi | White Tower',
          description: 'View price, photos, amenities and location details for this Tbilisi apartment.',
        }
      : {
          title: 'White Tower | Verified Tbilisi Apartments',
          description: 'Discover verified apartments and trusted real estate support in Tbilisi, Georgia.',
        });
    const canonicalPath = isApartment ? path : (path === '/' ? '/main' : path);
    const canonicalUrl = `${this.origin}${canonicalPath}`;
    const robots = isPrivate ? 'noindex, nofollow' : (page.robots || 'index, follow, max-image-preview:large');

    this.title.setTitle(page.title);
    this.setMeta('name', 'description', page.description);
    this.setMeta('name', 'robots', robots);
    this.setMeta('property', 'og:title', page.title);
    this.setMeta('property', 'og:description', page.description);
    this.setMeta('property', 'og:url', canonicalUrl);
    this.setMeta('name', 'twitter:title', page.title);
    this.setMeta('name', 'twitter:description', page.description);
    this.setCanonical(canonicalUrl);
  }

  private setMeta(attribute: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attribute]: key, content }, `${attribute}="${key}"`);
  }

  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = url;
  }
}
