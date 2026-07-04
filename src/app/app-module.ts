import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Main } from './main/main';
import { Navigation } from './navigation/navigation';
import { Footer } from './footer/footer';
import { ExploreProperty } from './explore-property/explore-property';
import { AgentProfile } from './agent-profile/agent-profile';
import { Login } from './login/login';
import { Blog } from './blog/blog';

@NgModule({
  declarations: [App, Main, Navigation, Footer, ExploreProperty, AgentProfile, Login, Blog],
  imports: [BrowserModule, AppRoutingModule, FormsModule],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App, ExploreProperty],
})
export class AppModule {}
