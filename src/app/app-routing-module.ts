import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ExploreProperty } from './explore-property/explore-property';
import { Main } from './main/main';
import { AgentProfile } from './agent-profile/agent-profile';
import { Login } from './login/login';
import { Blog } from './blog/blog';
import { MyProfile } from './my-profile/my-profile';

import { authGuard } from './guards/auth.guard';
import { agentGuard, crmGuard } from './guards/agent.guard';
import { guestGuard } from './guards/guest.guard';

import { UploadApartment } from './upload-apartment/upload-apartament';
import { AdminPanel } from './admin-panel/admin-panel';
import { AboutUs } from './about-us/about-us';
import { MyListings } from './my-listings/my-listings';
import { ApartmentDetail } from './apartment-detail/apartment-detail';

import {
  AiConciergePageComponent
} from './ai-property-concierge/ai-concierge-page/ai-concierge-page.component';

import {
  AiHomeMatchPageComponent
} from './ai-home-match/ai-home-match-page/ai-home-match-page.component';

import { Services } from './services/services';
import { SavedListings } from './saved-listings/saved-listings';
import { AgentDetailProfile } from './agent-detail-profile/agent-detail-profile';

import {
  CrmQuestioner
} from './crm/crm-questioner/crm-questioner';


const routes: Routes = [

  {
    path: '',
    redirectTo: 'main',
    pathMatch: 'full'
  },

  {
    path: 'main',
    component: Main,
    title: 'Verified Apartments for Rent in Tbilisi | Velven'
  },

  {
    path: 'ExploreProperty',
    component: ExploreProperty,
    title: 'Explore Apartments in Tbilisi | Velven'
  },

  {
    path: 'apartments/:id',
    component: ApartmentDetail,
    title: 'Apartment Details | Velven'
  },

  {
    path: 'find-my-home',
    component: AiConciergePageComponent,
    title: 'Find My Home | Velven'
  },

  {
    path: 'ai-home-match',
    component: AiHomeMatchPageComponent,
    title: 'AI Home Matcher | Velven'
  },

  {
    path: 'about',
    component: AboutUs,
    title: 'About Us | Velven'
  },

  {
    path: 'services',
    component: Services,
    title: 'Real Estate Services | Velven'
  },

  {
    path: 'apartment-detail',
    component: ApartmentDetail,
    title: 'Apartment Details | Velven'
  },

  {
    path: 'agent-profile',
    component: AgentProfile,
    title: 'Real Estate Agents in Tbilisi | Velven'
  },

  {
    path: 'agent-profile/:id',
    component: AgentDetailProfile,
    title: 'Agent Profile | Velven'
  },

  {
    path: 'login',
    component: Login,
    title: 'Sign In | Velven',
    canActivate: [guestGuard]
  },

  {
    path: 'blog',
    component: Blog,
    title: 'Tbilisi Property Blog | Velven'
  },

  {
    path: 'upload-apartment',
    component: UploadApartment,
    title: 'List Your Property | Velven',
    canActivate: [authGuard]
  },

  {
    path: 'admin',
    component: AdminPanel,
    title: 'Dashboard | Velven',
    canActivate: [authGuard, agentGuard]
  },

  {
    path: 'crm',
    loadComponent: () =>
      import('./crm/crm-dashboard/crm-dashboard')
        .then(module => module.CrmDashboard),

    title: 'Lead Pipeline | Velven',

    canActivate: [
      authGuard,
      crmGuard
    ]
  },

  {
    path: 'crm/leads/:id',

    loadComponent: () =>
      import('./crm/lead-detail/lead-detail')
        .then(module => module.CrmLeadDetail),

    title: 'Lead Details | Velven',

    canActivate: [
      authGuard,
      crmGuard
    ]
  },

  {
    path: 'my-profile',
    component: MyProfile,
    title: 'My Profile | Velven',
    canActivate: [authGuard]
  },

  {
    path: 'my-listings',
    component: MyListings,
    title: 'My Listings | Velven',
    canActivate: [authGuard]
  },

  {
    path: 'saved-listings',
    component: SavedListings,
    title: 'Saved Listings | Velven',
    canActivate: [authGuard]
  },

  {
    path: 'premium',
    component: MyProfile,
    canActivate: [authGuard]
  },

  {
    path: 'balance',
    component: MyProfile,
    canActivate: [authGuard]
  },

  {
    path: 'payment-methods',
    component: MyProfile,
    canActivate: [authGuard]
  },

  {
    path: 'my-business',
    component: MyProfile,
    canActivate: [authGuard]
  },

  {
    path: 'crm/questions',
    component: CrmQuestioner,
    title: 'CRM Questions | Velven',
    canActivate: [
      authGuard,
      crmGuard
    ]
  },

  {
    path: 'crm-questioner',
    component: CrmQuestioner,
    title: 'Apartment Questionnaire | Velven'
  },

  {
    path: 'crm-questioner/:agentToken',
    component: CrmQuestioner,
    title: 'Apartment Questionnaire | Velven'
  },

  {
    path: '**',
    redirectTo: 'main'
  }

];


@NgModule({
  imports: [
    RouterModule.forRoot(routes)
  ],

  exports: [
    RouterModule
  ]
})
export class AppRoutingModule {}