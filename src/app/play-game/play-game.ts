import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ClientCoupon, CouponService, GAME_REWARD_FLOOR } from '../services/coupon.service';

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
export class PlayGame implements OnInit, OnDestroy {
  @ViewChild('stage') private stage?: ElementRef<HTMLElement>;
  playing = false;
  /** The game covers the whole screen (phones start this way). */
  fullscreen = false;
  rewardFloor = GAME_REWARD_FLOOR;
  /** Highest floor reached in this visit, reported by the game. */
  bestFloor = 0;
  /** Reward panel: shown once when the player reaches the reward floor. */
  reward: 'saving' | 'saved' | 'login' | 'error' | null = null;
  coupon: ClientCoupon | null = null;
  private rewardClaimed = false;

  constructor(
    private auth: AuthService,
    private couponService: CouponService,
  ) {}

  ngOnInit(): void {
    this.couponService.getGameRules().subscribe({
      next: (rules) => (this.rewardFloor = rules.rewardFloor || GAME_REWARD_FLOOR),
      error: () => undefined,
    });
  }

  /** Admins get a test button that reports floors the way the game will. */
  get canTestReward(): boolean {
    return this.auth.isCrmManager;
  }

  testNextFloor(): void {
    this.onGameMessage(
      new MessageEvent('message', { origin: window.location.origin, data: { type: 'velven-game', floor: this.bestFloor + 1 } }),
    );
  }

  /**
   * The game reports each floor it reaches: window.parent.postMessage({ type: 'velven-game',
   * floor }) from public/games/axali/index.html. Reaching the reward floor saves the $50
   * cashback coupon to the player's account.
   */
  @HostListener('window:message', ['$event'])
  onGameMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: string; floor?: unknown } | null;
    if (data?.type !== 'velven-game') return;
    const floor = Number(data.floor);
    if (!Number.isFinite(floor)) return;
    this.bestFloor = Math.max(this.bestFloor, Math.floor(floor));
    if (this.bestFloor >= this.rewardFloor && !this.rewardClaimed) {
      this.rewardClaimed = true;
      this.saveReward();
    }
  }

  saveReward(): void {
    if (!this.auth.isLoggedIn) {
      // Kept until they log in; My coupons saves it then.
      this.couponService.rememberPendingWin(this.bestFloor);
      this.reward = 'login';
      return;
    }
    this.reward = 'saving';
    this.couponService.claimGameReward(this.bestFloor).subscribe({
      next: (result) => {
        this.coupon = result.coupon;
        this.reward = 'saved';
      },
      error: () => (this.reward = 'error'),
    });
  }

  closeReward(): void {
    this.reward = null;
  }

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
