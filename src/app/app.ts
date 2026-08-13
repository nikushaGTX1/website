import { AfterViewInit, Component, HostListener, OnDestroy, signal } from '@angular/core';
import { TranslationService } from './services/translation.service';
import { SeoService } from './services/seo.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App implements AfterViewInit, OnDestroy {
  protected readonly title = signal('site');
  protected screenshotWarningVisible = false;
  private screenshotWarningTimer?: number;

  constructor(
    private translation: TranslationService,
    private seo: SeoService,
  ) {
    this.seo.start();
  }

  ngAfterViewInit(): void {
    this.translation.start();
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.screenshotWarningTimer);
  }

  @HostListener('document:keydown', ['$event'])
  @HostListener('document:keyup', ['$event'])
  onScreenshotShortcut(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const screenshotShortcut =
      key === 'printscreen' ||
      ((event.metaKey || event.ctrlKey) && event.shiftKey && key === 's') ||
      (event.metaKey && event.altKey && key === 's');

    if (!screenshotShortcut) return;
    event.preventDefault();
    this.showScreenshotWarning();
  }

  @HostListener('window:blur')
  onWindowBlur(): void {
    this.showScreenshotWarning(false);
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.scheduleScreenshotWarningClose();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.hidden) {
      this.showScreenshotWarning(false);
    } else {
      this.scheduleScreenshotWarningClose();
    }
  }

  private showScreenshotWarning(autoClose = true): void {
    window.clearTimeout(this.screenshotWarningTimer);
    this.screenshotWarningVisible = true;
    if (autoClose) this.scheduleScreenshotWarningClose();
  }

  private scheduleScreenshotWarningClose(): void {
    window.clearTimeout(this.screenshotWarningTimer);
    this.screenshotWarningTimer = window.setTimeout(() => {
      this.screenshotWarningVisible = false;
    }, 1800);
  }
}
