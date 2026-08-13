import { AfterViewInit, Component, HostListener, signal } from '@angular/core';
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
  ) {
    this.seo.start();
  }

  ngAfterViewInit(): void {
    this.translation.start();
  }

  @HostListener('document:contextmenu', ['$event'])
  preventProtectedImageMenu(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('[data-protected-image], [data-protected-photo]')) {
      event.preventDefault();
    }
  }

  @HostListener('document:dragstart', ['$event'])
  preventProtectedImageDrag(event: DragEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('[data-protected-image], [data-protected-photo]')) {
      event.preventDefault();
    }
  }

}
