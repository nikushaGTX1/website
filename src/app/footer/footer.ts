import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_CONTACT, telHref } from '../utils/site-contact';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.html',
  styleUrl: './footer.css',
  imports: [RouterLink],
})
export class Footer {
  readonly phone = SITE_CONTACT.phone;
  readonly phoneHref = telHref(SITE_CONTACT.phone);
}
