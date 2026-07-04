import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
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
  ],
  imports: [BrowserModule, AppRoutingModule, FormsModule],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
  bootstrap: [App],
})
export class AppModule {}
