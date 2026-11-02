import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../utils/api-config';

export interface ClientCoupon {
  id: number;
  kind: string;
  code: string;
  amountUsd: number;
  title: string;
  createdAt: string;
  redeemedAt: string | null;
  status: 'active' | 'redeemed';
}

/** Floor the player must reach in the Velven game to win the $50 cashback (same as the API). */
export const GAME_REWARD_FLOOR = 30;

/** A win made while logged out, kept until the player logs in and it can be saved. */
const PENDING_WIN_KEY = 'velvenPendingGameWin';

@Injectable({ providedIn: 'root' })
export class CouponService {
  private readonly apiUrl = `${API_URL}/Coupons`;

  constructor(private http: HttpClient) {}

  /** Reward floor in use on the server (it can be lowered there for testing). */
  getGameRules(): Observable<{ rewardFloor: number; amountUsd: number }> {
    return this.http.get<{ rewardFloor: number; amountUsd: number }>(`${this.apiUrl}/game-rules`);
  }

  getMine(): Observable<ClientCoupon[]> {
    return this.http.get<ClientCoupon[]>(this.apiUrl);
  }

  claimGameReward(floor: number): Observable<{ created: boolean; coupon: ClientCoupon }> {
    return this.http.post<{ created: boolean; coupon: ClientCoupon }>(`${this.apiUrl}/game-reward`, { floor });
  }

  rememberPendingWin(floor: number): void {
    try {
      localStorage.setItem(PENDING_WIN_KEY, String(floor));
    } catch {
      // Private mode: the win just is not kept.
    }
  }

  takePendingWin(): number | null {
    try {
      const floor = Number(localStorage.getItem(PENDING_WIN_KEY));
      localStorage.removeItem(PENDING_WIN_KEY);
      // The server checks the floor against its own (possibly lowered) reward floor.
      return floor > 0 ? floor : null;
    } catch {
      return null;
    }
  }
}
