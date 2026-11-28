import { AfterViewInit, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_CONTACT, telHref } from '../utils/site-contact';

@Component({
  selector: 'app-services',
  templateUrl: './services.html',
  styleUrl: './services.css',
  imports: [RouterLink],
})
export class Services implements AfterViewInit {
  /** One public number and e-mail for the whole site (same as the footer). */
  readonly phone = SITE_CONTACT.phone;
  readonly phoneHref = telHref(SITE_CONTACT.phone);
  readonly email = SITE_CONTACT.email;


  /** Hero buttons: smooth scroll to a section and put it in the address (#our-services). */
  scrollTo(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${id}`);
  }

  /** Opened from a link like /services#consultation: go straight to that section. */
  ngAfterViewInit(): void {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60);
  }
}
