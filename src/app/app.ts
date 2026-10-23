import {
  AfterViewInit,
  Component,
  HostListener,
  signal
} from '@angular/core';

import { NavigationError, NavigationStart, Router } from '@angular/router';

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
    this.watchForNewBuild();
    this.router.events.subscribe((event) => {
      // A newer version was deployed while this tab stayed open (phones keep tabs for days):
      // the next page change loads it fully instead of continuing with the old one.
      if (event instanceof NavigationStart && this.newBuildAvailable) {
        window.location.assign(event.url);
        return;
      }
      // A tab left open across a deploy asks for page files that no longer exist, so taps on
      // links silently fail. Load the target page fresh instead (at most once a minute, so a
      // real outage cannot cause a reload loop).
      if (!(event instanceof NavigationError)) return;
      const message = String((event.error as Error)?.message || event.error || '');
      if (!/dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically/i.test(message)) return;
      const last = Number(sessionStorage.getItem('velven-stale-build-reload')) || 0;
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem('velven-stale-build-reload', String(Date.now()));
      window.location.assign(event.url);
    });
  }

  /** True once the server serves a different build than the one running in this tab. */
  private newBuildAvailable = false;
  private lastBuildCheck = 0;

  /**
   * Compares this tab's main-XXXX.js with the one the server sends now. Checked when the tab
   * comes back to the front, when the browser restores it from its back/forward cache, and
   * every 10 minutes while it is open.
   */
  private watchForNewBuild(): void {
    const running = document
      .querySelector<HTMLScriptElement>('script[src*="main-"]')
      ?.getAttribute('src')
      ?.match(/main-[A-Z0-9]+\.js/i)?.[0];
    if (!running) return; // Development build: no hashed file names.
    const check = (): void => {
      if (this.newBuildAvailable || document.visibilityState !== 'visible') return;
      if (Date.now() - this.lastBuildCheck < 60_000) return;
      this.lastBuildCheck = Date.now();
      fetch('/main', { cache: 'no-store', credentials: 'same-origin' })
        .then((response) => (response.ok ? response.text() : ''))
        .then((html) => {
          const served = html.match(/main-[A-Z0-9]+\.js/i)?.[0];
          if (served && served !== running) this.newBuildAvailable = true;
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        this.lastBuildCheck = 0;
        check();
      }
    });
    window.setInterval(check, 10 * 60_000);
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

  get isExploreProperty(): boolean {
    return this.router.url.split(/[?#]/, 1)[0].toLowerCase() === '/exploreproperty';
  }

  get showNavigation(): boolean {
    const path = this.router.url.split(/[?#]/, 1)[0];
    const knownSingleSegmentPages = new Set([
      'main', 'ExploreProperty', 'property', 'find-my-home', 'ai-home-match',
      'about', 'services', 'apartment-detail', 'agent-profile', 'login', 'blog',
      'upload-apartment', 'admin', 'crm', 'my-profile', 'my-listings',
      'saved-listings', 'premium', 'balance', 'payment-methods', 'my-business',
      'register', 'discover',
    ]);
    const segments = path.split('/').filter(Boolean);
    const isShortQuestionnaireUrl =
      segments.length === 1 && !knownSingleSegmentPages.has(segments[0]);

    return !path.startsWith('/crm-questioner') &&
      !path.startsWith('/questions/') &&
      !isShortQuestionnaireUrl;
  }
}
