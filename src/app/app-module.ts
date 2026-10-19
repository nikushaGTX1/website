import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Navigation } from './navigation/navigation';
import { Footer } from './footer/footer';
import { authInterceptor } from './interceptors/auth.interceptor';
import { apiPerformanceInterceptor } from './interceptors/api-performance.interceptor';

/**
 * Only the shell (navigation, footer) loads up front. Every page is its own file loaded
 * by its route (see app-routing-module), so opening the home page no longer downloads the
 * upload form, admin panel, CRM, Velven Match and the rest.
 */
@NgModule({
  declarations: [App],
  imports: [BrowserModule, AppRoutingModule, Navigation, Footer],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor, apiPerformanceInterceptor])),
  ],
  bootstrap: [App],
})
export class AppModule {}
