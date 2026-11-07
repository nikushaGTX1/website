import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-services',
  templateUrl: './services.html',
  styleUrl: './services.css',
  imports: [RouterLink],
})
export class Services {
  /** Hero buttons: smooth scroll to a section on this page. */
  scrollTo(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
