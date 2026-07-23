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
  { path: 'main', component: Main },
  { path: 'ExploreProperty', component: ExploreProperty },
  { path: 'apartments/:id', component: ApartmentDetail },
  { path: 'find-my-home', component: AiConciergePageComponent },
  { path: 'ai-home-match', component: AiHomeMatchPageComponent },
  { path: 'apartment-detail', component: ApartmentDetail },
  { path: 'agent-profile', component: AgentProfile },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'blog', component: Blog },
  { path: 'upload-apartment', component: UploadApartment, canActivate: [authGuard] },
  { path: 'admin', component: AdminPanel, canActivate: [authGuard, agentGuard] },
  { path: 'my-profile', component: MyProfile, canActivate: [authGuard] },
  { path: 'my-listings', component: MyListings, canActivate: [authGuard] },
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
