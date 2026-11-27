import 'zone.js';
import { provideZoneChangeDetection } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';

// iPhone/iPad Safari zooms the page into any field with text under 16px (sign-in, register...)
// and leaves it zoomed. maximum-scale=1 stops that focus zoom; Safari still lets people
// pinch-zoom, so it is only set there (on Android it would block pinch-zoom).
if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
}

platformBrowser().bootstrapModule(AppModule, {
  applicationProviders: [
    provideZoneChangeDetection({
      eventCoalescing: true,
      runCoalescing: true,
    }),
  ],
})
  .catch(err => console.error(err));

// Listing photos: no right-click "Save image as" and no dragging images out of the page.
document.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest('img, picture, [style*="background-image"]')) event.preventDefault();
});
document.addEventListener('dragstart', (event) => {
  if ((event.target as HTMLElement | null)?.tagName === 'IMG') event.preventDefault();
});
