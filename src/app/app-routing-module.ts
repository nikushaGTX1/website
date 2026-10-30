import { Injectable, NgModule } from '@angular/core';
import { Observable, mergeMap, timer } from 'rxjs';
import { PreloadingStrategy, Route, RouterModule, Routes } from '@angular/router';

/**
 * Fetch the other pages in the background, but only after the first page and its photos
 * have loaded: preloading ~70 files at start-up delayed the photos on screen.
 */
@Injectable({ providedIn: 'root' })
export class AfterFirstPagePreloading implements PreloadingStrategy {
  preload(_route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return timer(2500).pipe(mergeMap(() => load()));
  }
}


import { authGuard } from './guards/auth.guard';
import { agentGuard, crmGuard } from './guards/agent.guard';
import { questionnaireLinkGuard } from './guards/questionnaire-link.guard';
import { guestGuard } from './guards/guest.guard';
import { clientGuard } from './guards/client.guard';







const routes: Routes = [
  { path: 'clients', loadComponent: () => import('./clients/clients').then(m => m.Clients), title: 'Clients | Velven' },

  {
    path: '',
    redirectTo: 'main',
    pathMatch: 'full'
  },

  {
    path: 'main',
    loadComponent: () => import('./main/main').then((m) => m.Main),
    title: 'Velven | Apartments for Rent & Sale in Tbilisi'
  },

  {
    path: 'ExploreProperty',
    loadComponent: () => import('./explore-property/explore-property').then((m) => m.ExploreProperty),
    title: 'Explore Apartments in Tbilisi | Velven'
  },

  {
    path: 'apartments/:id',
    loadComponent: () => import('./apartment-detail/apartment-detail').then((m) => m.ApartmentDetail),
    title: 'Apartment Details | Velven'
  },

  {
    path: 'property',
    loadComponent: () => import('./apartment-detail/apartment-detail').then((m) => m.ApartmentDetail),
    title: 'Apartment Details | Velven'
  },

  {
    path: 'find-my-home',
    loadComponent: () => import('./ai-property-concierge/ai-concierge-page/ai-concierge-page.component').then((m) => m.AiConciergePageComponent),
    title: 'Find My Home | Velven'
  },

  {
    path: 'ai-home-match',
    loadComponent: () => import('./ai-home-match/ai-home-match-page/ai-home-match-page.component').then((m) => m.AiHomeMatchPageComponent),
    title: 'Velven Match | Velven'
  },

  {
    path: 'about',
    loadComponent: () => import('./about-us/about-us').then((m) => m.AboutUs),
    title: 'About Us | Velven'
  },

  {
    path: 'careers',
    loadComponent: () => import('./careers/careers').then(module => module.Careers),
    title: 'Careers | Velven'
  },

  {
    path: 'services',
    loadComponent: () => import('./services/services').then((m) => m.Services),
    title: 'Real Estate Services | Velven'
  },

  {
    path: 'apartment-detail',
    loadComponent: () => import('./apartment-detail/apartment-detail').then((m) => m.ApartmentDetail),
    title: 'Apartment Details | Velven'
  },

  {
    path: 'agent-profile',
    loadComponent: () => import('./agent-profile/agent-profile').then((m) => m.AgentProfile),
    title: 'Real Estate Agents in Tbilisi | Velven'
  },

  {
    path: 'agent-profile/:id',
    loadComponent: () => import('./agent-detail-profile/agent-detail-profile').then((m) => m.AgentDetailProfile),
    title: 'Agent Profile | Velven'
  },

  {
    path: 'agent-profile/:id/listings',
    loadComponent: () => import('./agent-detail-profile/agent-detail-profile').then((m) => m.AgentDetailProfile),
    data: { listingsPage: true },
    title: 'Agent Properties | Velven'
  },

  {
    path: 'login',
    loadComponent: () => import('./login/login').then((m) => m.Login),
    title: 'Sign In | Velven',
    canActivate: [guestGuard]
  },

  {
    path: 'register',
    loadComponent: () => import('./login/login').then((m) => m.Login),
    title: 'Create Your Account | Velven',
    data: { register: true },
    canActivate: [guestGuard]
  },

  {
    path: 'discover',
    loadComponent: () => import('./discover/discover').then((m) => m.Discover),
    title: 'Velven Discover | Velven',
    canActivate: [clientGuard]
  },

  {
    path: 'blog',
    loadComponent: () => import('./blog/blog').then((m) => m.Blog),
    title: 'Tbilisi Property Blog | Velven'
  },

  {
    path: 'upload-apartment',
    loadComponent: () => import('./upload-apartment/upload-apartament').then((m) => m.UploadApartment),
    title: 'List Your Property | Velven',
    canActivate: [authGuard]
  },

  {
    path: 'admin',
    loadComponent: () => import('./admin-panel/admin-panel').then((m) => m.AdminPanel),
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
    path: 'crm/clients/:status',
    loadComponent: () =>
      import('./crm/crm-dashboard/crm-dashboard')
        .then(module => module.CrmDashboard),
    title: 'CRM Clients | Velven',
    canActivate: [authGuard, crmGuard]
  },

  {
    path: 'crm/agents/:agentId',
    loadComponent: () =>
      import('./crm/crm-dashboard/crm-dashboard')
        .then(module => module.CrmDashboard),
    title: 'Agent Leads | Velven',
    canActivate: [authGuard, crmGuard]
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
    path: 'crm/owner-submissions',
    loadComponent: () => import('./crm/owner-submissions/owner-submissions').then(module => module.OwnerSubmissions),
    title: 'Owner Submissions | Velven',
    canActivate: [authGuard, crmGuard]
  },

  {
    path: 'my-profile',
    loadComponent: () => import('./my-profile/my-profile').then((m) => m.MyProfile),
    title: 'My Profile | Velven',
    canActivate: [authGuard]
  },

  {
    path: 'my-listings',
    loadComponent: () => import('./my-listings/my-listings').then((m) => m.MyListings),
    title: 'My Listings | Velven',
    canActivate: [authGuard]
  },

  {
    path: 'my-viewings',
    loadComponent: () => import('./my-viewings/my-viewings').then((module) => module.MyViewings),
    title: 'My viewings | Velven',
    canActivate: [authGuard]
  },
  {
    path: 'saved-listings',
    loadComponent: () => import('./saved-listings/saved-listings').then((m) => m.SavedListings),
    title: 'Saved Listings | Velven',
    canActivate: [authGuard]
  },

  {
    path: 'premium',
    loadComponent: () => import('./my-profile/my-profile').then((m) => m.MyProfile),
    canActivate: [authGuard]
  },

  {
    path: 'balance',
    loadComponent: () => import('./my-profile/my-profile').then((m) => m.MyProfile),
    canActivate: [authGuard]
  },

  {
    path: 'payment-methods',
    loadComponent: () => import('./my-profile/my-profile').then((m) => m.MyProfile),
    canActivate: [authGuard]
  },

  {
    path: 'my-business',
    loadComponent: () => import('./my-profile/my-profile').then((m) => m.MyProfile),
    canActivate: [authGuard]
  },

  {
    path: 'crm/photo-cleaner',
    loadComponent: () => import('./crm/photo-cleaner/photo-cleaner').then((m) => m.PhotoCleaner),
    title: 'Watermark Remover | Velven',
    canActivate: [authGuard, crmGuard]
  },

  {
    path: 'crm/questions',
    loadComponent: () => import('./crm/crm-questioner/crm-questioner').then((m) => m.CrmQuestioner),
    title: 'CRM Questions | Velven',
    canActivate: [
      authGuard,
      crmGuard
    ]
  },

  {
    path: 'crm-questioner',
    loadComponent: () => import('./crm/crm-questioner/crm-questioner').then((m) => m.CrmQuestioner),
    title: 'Apartment Questionnaire | Velven'
  },

  {
    path: 'crm-questioner/:agentToken',
    loadComponent: () => import('./crm/crm-questioner/crm-questioner').then((m) => m.CrmQuestioner),
    title: 'Apartment Questionnaire | Velven'
  },

  {
    path: 'questions/:agentToken',
    loadComponent: () => import('./crm/crm-questioner/crm-questioner').then((m) => m.CrmQuestioner),
    title: 'Apartment Questionnaire | Velven'
  },

  {
    path: 'review/:slug',
    loadComponent: () => import('./review/review-page').then(module => module.ReviewPage),
    title: 'Leave a Review | Velven'
  },

  {
    path: 'my-reviews',
    loadComponent: () => import('./my-reviews/my-reviews').then(module => module.MyReviews),
    title: 'My Reviews | Velven',
    canActivate: [authGuard, agentGuard]
  },

  {
    path: 'owner/:token',
    loadComponent: () => import('./owner-listing/owner-listing').then(module => module.OwnerListing),
    title: 'List Your Property | Velven'
  },

  {
    path: ':agentToken',
    loadComponent: () => import('./crm/crm-questioner/crm-questioner').then((m) => m.CrmQuestioner),
    title: 'Apartment Questionnaire | Velven',
    canMatch: [questionnaireLinkGuard]
  },

  {
    path: '**',
    loadComponent: () => import('./not-found/not-found').then((module) => module.NotFound),
    title: 'Page not found | Velven'
  }

];


@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      // After the first page shows, fetch the other pages in the background so later
      // clicks open instantly.
      preloadingStrategy: AfterFirstPagePreloading,
      scrollPositionRestoration: 'top',
    })
  ],

  exports: [
    RouterModule
  ]
})
export class AppRoutingModule {}
