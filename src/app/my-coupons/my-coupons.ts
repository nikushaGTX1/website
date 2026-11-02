import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ClientCoupon, CouponService, GAME_REWARD_FLOOR } from '../services/coupon.service';

/** The client's inventory: rewards such as the $50 cashback won in the Velven game. */
@Component({
  selector: 'app-my-coupons',
  standalone: true,
  imports: [RouterModule, DatePipe],
  templateUrl: './my-coupons.html',
  styleUrl: './my-coupons.css',
})
export class MyCoupons implements OnInit {
  readonly rewardFloor = GAME_REWARD_FLOOR;
  coupons: ClientCoupon[] = [];
  loading = true;
  error = false;
  copiedId: number | null = null;

  constructor(private couponService: CouponService) {}

  ngOnInit(): void {
    // A win made before logging in is saved now.
    const pending = this.couponService.takePendingWin();
    if (pending) {
      this.couponService.claimGameReward(pending).subscribe({ next: () => this.load(), error: () => this.load() });
    } else {
      this.load();
    }
  }

  load(): void {
    this.loading = true;
    this.couponService.getMine().subscribe({
      next: (coupons) => {
        this.coupons = coupons;
        this.loading = false;
        this.error = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  copy(coupon: ClientCoupon): void {
    navigator.clipboard?.writeText(coupon.code).then(
      () => {
        this.copiedId = coupon.id;
        setTimeout(() => (this.copiedId = null), 2000);
      },
      () => undefined,
    );
  }
}
