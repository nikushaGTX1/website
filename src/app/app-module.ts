import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Main } from './main/main';
import { Navigation } from './navigation/navigation';
import { Footer } from './footer/footer';
import { ExploreProperty } from './explore-property/explore-property';
import { AgentProfile } from './agent-profile/agent-profile';
import { Login } from './login/login';
import { Blog } from './blog/blog';
import { ProfileBurgerMenu } from './profile-burger-menu/profile-burger-menu';
import { MyProfile } from './my-profile/my-profile';
import { authInterceptor } from './interceptors/auth.interceptor';
import { UploadApartment } from './upload-apartment/upload-apartament';
import { AdminPanel } from './admin-panel/admin-panel';
import { MyListings } from './my-listings/my-listings';
import { ApartmentDetail } from './apartment-detail/apartment-detail';
import { AiConciergePageComponent } from './ai-property-concierge/ai-concierge-page/ai-concierge-page.component';
import { ConciergeResultsComponent } from './ai-property-concierge/concierge-results/concierge-results.component';
import { LifestyleAvatarComponent } from './ai-property-concierge/lifestyle-avatar/lifestyle-avatar.component';
import { GooglePropertyMapComponent } from './maps/google-property-map/google-property-map.component';
import { AiHomeMatchPageComponent } from './ai-home-match/ai-home-match-page/ai-home-match-page.component';
import { HomeMatchResultsComponent } from './ai-home-match/home-match-results/home-match-results.component';
import { HomeProfileSummaryComponent } from './ai-home-match/home-profile-summary/home-profile-summary.component';
import { VelvenLifestyleAvatarComponent } from './ai-home-match/lifestyle-avatar/lifestyle-avatar.component';

@NgModule({
  declarations: [
    App,
    Main,
    Navigation,
    Footer,
    ExploreProperty,
    AgentProfile,
    Login,
    Blog,
    ProfileBurgerMenu,
    MyProfile,
    UploadApartment,
    AdminPanel,
    MyListings,
    ApartmentDetail,
    AiConciergePageComponent,
    ConciergeResultsComponent,
    LifestyleAvatarComponent,
    GooglePropertyMapComponent,
    AiHomeMatchPageComponent,
    HomeMatchResultsComponent,
    HomeProfileSummaryComponent,
    VelvenLifestyleAvatarComponent,
  ],
  imports: [BrowserModule, AppRoutingModule, FormsModule, ReactiveFormsModule],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
  bootstrap: [App],
})
export class AppModule {}
