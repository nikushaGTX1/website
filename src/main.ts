import 'zone.js';
import { provideZoneChangeDetection } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';

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
