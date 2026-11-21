import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Phone-only bottom bar: Saved homes, List your property (middle), Velven Discover.
 * Every tab needs an account: signed-out visitors go to sign-in and come back after.
 * Hidden on pages that already have their own bottom bar or need the whole screen.
 */
@Component({
  selector: 'app-mobile-tab-bar',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      <nav class="tab-bar" aria-label="Quick menu">
        <a class="tab" [class.active]="active === 'saved'" [routerLink]="target('/discover')" [queryParams]="params('/discover', { tab: 'saved' })">
          <i class="fa-regular fa-heart" aria-hidden="true"></i>
          <span>Saved</span>
        </a>
        <a class="tab upload" [class.active]="active === 'upload'" [routerLink]="target('/upload-apartment')" [queryParams]="params('/upload-apartment')">
          <span class="upload-circle" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>
          <span>List property</span>
        </a>
        <a class="tab" [class.active]="active === 'discover'" [routerLink]="target('/discover')" [queryParams]="params('/discover')">
          @if (loggedIn) {<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>} @else {<i class="fa-regular fa-circle-user" aria-hidden="true"></i>}
          <span>{{ loggedIn ? 'Velven Discover' : 'Sign in' }}</span>
        </a>
      </nav>
    }
  `,
  styleUrl: './mobile-tab-bar.css',
})
export class MobileTabBar {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private path = '';

  /** Pages with their own bottom bar, full-screen tools, sign-in or staff workspaces. */
  private static readonly hiddenOn = [
    /^\/ai-home-match/, /^\/apartments\//, /^\/upload-apartment/, /^\/submit-apartment/, /^\/play/,
    /^\/login/, /^\/register/, /^\/crm/, /^\/admin/, /^\/questions\//, /^\/review\//, /^\/owner\//, /^\/m\//,
  ];

  constructor() {
    this.path = this.router.url.split(/[?#]/, 1)[0];
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        this.path = this.router.url.split(/[?#]/, 1)[0];
        this.cdr.markForCheck();
      });
  }

  get loggedIn(): boolean {
    return this.auth.isLoggedIn;
  }

  get visible(): boolean {
    return !MobileTabBar.hiddenOn.some((pattern) => pattern.test(this.path));
  }

  get active(): 'saved' | 'upload' | 'discover' | '' {
    const url = this.router.url;
    if (this.path === '/discover' && /[?&]tab=saved\b/.test(url)) return 'saved';
    if (this.path.startsWith('/upload-apartment')) return 'upload';
    if (this.path === '/discover') return 'discover';
    return '';
  }

  /** Signed in: the page itself. Signed out: sign-in (with a link to create an account), then back. */
  target(path: string): string {
    return this.loggedIn ? path : '/login';
  }

  params(path: string, query: Record<string, string> = {}): Record<string, string> {
    if (this.loggedIn) return query;
    const back = Object.keys(query).length ? `${path}?${new URLSearchParams(query)}` : path;
    return { returnUrl: back };
  }
}
