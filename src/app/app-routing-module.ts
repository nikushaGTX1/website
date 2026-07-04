import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ExploreProperty } from './explore-property/explore-property';
import { Main } from './main/main';
import { Navigation } from './navigation/navigation';
import { AgentProfile } from './agent-profile/agent-profile';

const routes: Routes = [
  { path: '', redirectTo: 'main', pathMatch: 'full' }, // 1. Automatically loads 'main' first
  { path: 'main', component: Main },
  { path: 'ExploreProperty', component: ExploreProperty },
  { path: 'agent-profile', component: AgentProfile },
  { path: '**', redirectTo: 'main' },

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
