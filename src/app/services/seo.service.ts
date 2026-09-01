import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

interface SeoPage {
  title: string;
  description: string;
  robots?: string;
  image?: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly origin = 'https://velven.ge';
  private readonly pages: Record<string, SeoPage> = {
    '/main': {
      title: 'Verified Apartments for Rent in Tbilisi | Velven',
      description:
        'Find verified apartments for rent in Tbilisi with accurate prices, trusted listings, local agents and personalized AI home matching.',
    },
    '/ExploreProperty': {
      title: 'Apartments for Rent and Sale in Tbilisi | Velven',
      description:
        'Browse verified Tbilisi apartments by location, price, bedrooms and amenities. Compare trusted listings and find your next home.',
    },
    '/agent-profile': {
      title: 'Trusted Real Estate Agents in Tbilisi | Velven',
      description:
        'Meet experienced Tbilisi real estate agents who can help you rent, buy or list a verified property with confidence.',
    },
    '/blog': {
      title: 'Tbilisi Real Estate Guides and Insights | Velven',
      description:
        'Read practical guides about renting, buying, neighborhoods and property trends in Tbilisi, Georgia.',
    },
    '/ai-home-match': {
      title: 'AI Home Matcher for Tbilisi Apartments | Velven',
      description:
        'Create a personalized home profile and discover Tbilisi apartments matched to your budget, commute and lifestyle.',
    },
    '/find-my-home': {
      title: 'Find My Home in Tbilisi | Velven',
      description:
        'Tell us what matters to you and get personalized Tbilisi apartment recommendations for your needs and lifestyle.',
    },
    '/about': {
      title: 'About Velven | Tbilisi Real Estate Platform',
      description:
        'Learn how Velven makes apartment searches in Tbilisi clearer with verified listings, local expertise and smart matching.',
    },
    '/services': {
      title: 'Real Estate Services in Tbilisi | Velven',
      description:
        'Explore professional property search, listing and real estate support services for renters, buyers and owners in Tbilisi.',
    },
    '/upload-apartment': {
      title: 'List Your Property in Tbilisi | Velven',
      description:
        'Submit your Tbilisi apartment for review and connect with serious renters and buyers.',
      robots: 'noindex, nofollow',
    },
    '/login': {
      title: 'Sign In | Velven',
      description: 'Sign in to manage your Velven profile, listings and saved Tbilisi properties.',
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

  updateApartment(apartment: { id: number; title?: string; description?: string }): void {
    const title = apartment.title?.trim() || 'Apartment in Tbilisi';
    const description =
      this.plainText(apartment.description) ||
      'View verified price, photos, amenities and location details for this Tbilisi apartment.';
    const canonicalUrl = `${this.origin}/apartments/${apartment.id}`;
    const image = `${this.origin}/seo/apartment-image/${apartment.id}`;

    this.title.setTitle(`${title} | Velven`);
    this.setMeta('name', 'description', description);
    this.setMeta('name', 'robots', 'index, follow, max-image-preview:large');
    this.setMeta('property', 'og:type', 'product');
    this.setMeta('property', 'og:title', `${title} | Velven`);
    this.setMeta('property', 'og:description', description);
    this.setMeta('property', 'og:url', canonicalUrl);
    this.setMeta('property', 'og:image', image);
    this.setMeta('name', 'twitter:title', `${title} | Velven`);
    this.setMeta('name', 'twitter:description', description);
    this.setMeta('name', 'twitter:image', image);
    this.setCanonical(canonicalUrl);
  }

  updateAgent(agent: {
    id?: string;
    userId?: string;
    fullName?: string;
    userName?: string;
    name?: string;
    bio?: string;
  }): void {
    const id = agent.id || agent.userId;
    if (!id) return;
    const name = agent.fullName || agent.name || agent.userName || 'Velven Agent';
    const title = `${name} — Real Estate Agent in Tbilisi | Velven`;
    const description =
      this.plainText(agent.bio) ||
      `View ${name}'s profile, experience and verified property listings with Velven in Tbilisi.`;
    const canonicalUrl = `${this.origin}/agent-profile/${encodeURIComponent(id)}`;

    this.title.setTitle(title);
    this.setMeta('name', 'description', description);
    this.setMeta('name', 'robots', 'index, follow, max-image-preview:large');
    this.setMeta('property', 'og:type', 'profile');
    this.setMeta('property', 'og:title', title);
    this.setMeta('property', 'og:description', description);
    this.setMeta('property', 'og:url', canonicalUrl);
    this.setMeta('property', 'og:image', `${this.origin}/banner.jpg`);
    this.setMeta('name', 'twitter:title', title);
    this.setMeta('name', 'twitter:description', description);
    this.setMeta('name', 'twitter:image', `${this.origin}/banner.jpg`);
    this.setCanonical(canonicalUrl);
  }

  private update(rawUrl: string): void {
    const path = rawUrl.split('?')[0].replace(/\/+$/, '') || '/main';
    const isApartment = /^\/apartments\/[^/]+$/.test(path);
    const isQuestionnaire = /^\/crm-questioner\/(?:agent-)?[a-z0-9-]+$/i.test(path);
    const isPrivate =
      /^\/(admin|crm(?:\/|$)|crm-questioner(?:\/|$)|my-profile|my-listings|saved-listings|upload-apartment|login|premium|balance|payment-methods|my-business)/.test(
        path,
      );
    const page =
      (isQuestionnaire
        ? {
            title: 'Your Personalized Home Search | Velven',
            description:
              'Complete this short, secure questionnaire so your Velven real estate agent can prepare a personalized property shortlist for you.',
            image: `${this.origin}/logosh2.png`,
          }
        : this.pages[path]) ||
      (isApartment
        ? {
            title: 'Apartment for Rent in Tbilisi | Velven',
            description:
              'View price, photos, amenities and location details for this Tbilisi apartment.',
          }
        : {
            title: 'Velven | Verified Tbilisi Apartments',
            description:
              'Discover verified apartments and trusted real estate support in Tbilisi, Georgia.',
          });
    const canonicalPath = isApartment ? path : path === '/' ? '/main' : path;
    const canonicalUrl = `${this.origin}${canonicalPath}`;
    const robots = isPrivate
      ? 'noindex, nofollow'
      : page.robots || 'index, follow, max-image-preview:large';

    this.title.setTitle(page.title);
    this.setMeta('name', 'description', page.description);
    this.setMeta('name', 'robots', robots);
    this.setMeta('property', 'og:title', page.title);
    this.setMeta('property', 'og:description', page.description);
    this.setMeta('property', 'og:url', canonicalUrl);
    if (page.image) {
      this.setMeta('property', 'og:image', page.image);
      this.setMeta('property', 'og:image:secure_url', page.image);
      this.setMeta('property', 'og:image:alt', 'Velven real estate');
      this.setMeta('name', 'twitter:image', page.image);
    }
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

  private plainText(value?: string): string {
    const text = (value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s*Source:\s*https?:\/\/\S+[\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 165 ? `${text.slice(0, 164).trimEnd()}…` : text;
  }
}
