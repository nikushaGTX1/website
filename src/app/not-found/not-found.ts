import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Shown for unknown paths; the URL stays as typed (VELVEN-012). */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
})
export class NotFound implements OnInit, OnDestroy {
  private robots?: HTMLMetaElement;

  ngOnInit(): void {
    this.robots = document.createElement('meta');
    this.robots.name = 'robots';
    this.robots.content = 'noindex';
    document.head.appendChild(this.robots);
  }

  ngOnDestroy(): void {
    this.robots?.remove();
  }
}
