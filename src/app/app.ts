import {
  AfterViewInit,
  Component,
  HostListener,
  signal
} from '@angular/core';

import { Router } from '@angular/router';

import { TranslationService } from './services/translation.service';
import { SeoService } from './services/seo.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App implements AfterViewInit {

  protected readonly title = signal('site');

  constructor(
    private translation: TranslationService,
    private seo: SeoService,
    private router: Router
  ) {
    this.seo.start();
  }

  ngAfterViewInit(): void {
    this.translation.start();
  }

  @HostListener('document:contextmenu', ['$event'])
  preventProtectedImageMenu(event: MouseEvent): void {
    const target =
      event.target as Element | null;

    if (
      target?.closest(
        '[data-protected-image], [data-protected-photo]'
      )
    ) {
      event.preventDefault();
    }
  }

  @HostListener('document:dragstart', ['$event'])
  preventProtectedImageDrag(event: DragEvent): void {
    const target =
      event.target as Element | null;

    if (
      target?.closest(
        '[data-protected-image], [data-protected-photo]'
      )
    ) {
      event.preventDefault();
    }
  }

  get showNavigation(): boolean {
    const path = this.router.url.split(/[?#]/, 1)[0];
    const knownSingleSegmentPages = new Set([
      'main', 'ExploreProperty', 'property', 'find-my-home', 'ai-home-match',
      'about', 'services', 'apartment-detail', 'agent-profile', 'login', 'blog',
      'upload-apartment', 'admin', 'crm', 'my-profile', 'my-listings',
      'saved-listings', 'premium', 'balance', 'payment-methods', 'my-business',
    ]);
    const segments = path.split('/').filter(Boolean);
    const isShortQuestionnaireUrl =
      segments.length === 1 && !knownSingleSegmentPages.has(segments[0]);

    return !path.startsWith('/crm-questioner') &&
      !path.startsWith('/questions/') &&
      !isShortQuestionnaireUrl;
  }
}
