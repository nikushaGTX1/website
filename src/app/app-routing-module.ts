import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ExploreProperty } from './explore-property/explore-property';
import { Main } from './main/main';
import { Navigation } from './navigation/navigation';
import { AgentProfile } from './agent-profile/agent-profile';
import { Login } from './login/login';
import { Blog } from './blog/blog';
import { MyProfile } from './my-profile/my-profile';
import { authGuard } from './guards/auth.guard';
import { agentGuard } from './guards/agent.guard';
import { guestGuard } from './guards/guest.guard';
import { UploadApartment } from './upload-apartment/upload-apartament';
import { AdminPanel } from './admin-panel/admin-panel';
import { MyListings } from './my-listings/my-listings';
import { ApartmentDetail } from './apartment-detail/apartment-detail';
import { AiConciergePageComponent } from './ai-property-concierge/ai-concierge-page/ai-concierge-page.component';
import { AiHomeMatchPageComponent } from './ai-home-match/ai-home-match-page/ai-home-match-page.component';

const routes: Routes = [
  { path: '', redirectTo: 'main', pathMatch: 'full' },
  { path: 'main', component: Main, title: 'Verified Apartments for Rent in Tbilisi | White Tower' },
  { path: 'ExploreProperty', component: ExploreProperty, title: 'Explore Apartments in Tbilisi | White Tower' },
  { path: 'apartments/:id', component: ApartmentDetail, title: 'Apartment Details | White Tower' },
  { path: 'find-my-home', component: AiConciergePageComponent, title: 'Find My Home | White Tower' },
  { path: 'ai-home-match', component: AiHomeMatchPageComponent, title: 'AI Home Matcher | White Tower' },
  { path: 'apartment-detail', component: ApartmentDetail, title: 'Apartment Details | White Tower' },
  { path: 'agent-profile', component: AgentProfile, title: 'Real Estate Agents in Tbilisi | White Tower' },
  { path: 'login', component: Login, title: 'Sign In | White Tower', canActivate: [guestGuard] },
  { path: 'blog', component: Blog, title: 'Tbilisi Property Blog | White Tower' },
  { path: 'upload-apartment', component: UploadApartment, title: 'List Your Property | White Tower', canActivate: [authGuard] },
  { path: 'admin', component: AdminPanel, title: 'Dashboard | White Tower', canActivate: [authGuard, agentGuard] },
  { path: 'my-profile', component: MyProfile, title: 'My Profile | White Tower', canActivate: [authGuard] },
  { path: 'my-listings', component: MyListings, title: 'My Listings | White Tower', canActivate: [authGuard] },
  { path: 'saved-listings', component: MyProfile, canActivate: [authGuard] },
  { path: 'premium', component: MyProfile, canActivate: [authGuard] },
  { path: 'balance', component: MyProfile, canActivate: [authGuard] },
  { path: 'payment-methods', component: MyProfile, canActivate: [authGuard] },
  { path: 'my-business', component: MyProfile, canActivate: [authGuard] },
  { path: '**', redirectTo: 'main' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
