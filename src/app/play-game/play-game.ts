import { Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * Velven game page. The Unity build lives in public/games/axali and runs in an iframe, so its
 * 24 MB only loads when someone opens this page and presses Play.
 */
@Component({
  selector: 'app-play-game',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './play-game.html',
  styleUrl: './play-game.css',
})
export class PlayGame implements OnDestroy {
  @ViewChild('stage') private stage?: ElementRef<HTMLElement>;
  playing = false;
  /** The game covers the whole screen (phones start this way). */
  fullscreen = false;

  play(): void {
    this.playing = true;
    if (window.matchMedia('(max-width: 820px)').matches) this.enterFullscreen();
  }

  enterFullscreen(): void {
    this.fullscreen = true;
    document.body.style.overflow = 'hidden';
    // Real fullscreen hides the browser bars (Android, desktop). iPhones do not allow it for
    // page elements, so there the game simply covers the page.
    this.stage?.nativeElement.requestFullscreen?.().catch(() => undefined);
  }

  exitFullscreen(): void {
    this.fullscreen = false;
    document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }

  /** Leaving real fullscreen with the system back gesture or Esc also closes the cover mode. */
  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement && this.fullscreen) this.exitFullscreen();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }
}
