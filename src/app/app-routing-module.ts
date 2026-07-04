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
import { guestGuard } from './guards/guest.guard';
import { UploadApartment } from './upload-apartment/upload-apartament';

const routes: Routes = [
  { path: '', redirectTo: 'main', pathMatch: 'full' },
  { path: 'main', component: Main },
  { path: 'ExploreProperty', component: ExploreProperty },
  { path: 'agent-profile', component: AgentProfile },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'blog', component: Blog },
  { path: 'upload-apartment', component: UploadApartment },
  { path: 'my-profile', component: MyProfile, canActivate: [authGuard] },
  { path: 'my-listings', component: MyProfile, canActivate: [authGuard] },
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
