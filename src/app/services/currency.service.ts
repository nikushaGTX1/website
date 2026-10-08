import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, forkJoin, map, of } from 'rxjs';

interface FrankfurterRate {
  base: string;
  quote: string;
  rate: number;
}

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly usdGelSubject = new BehaviorSubject(2.7);

  readonly usdGel$ = this.usdGelSubject.asObservable();

  constructor(private http: HttpClient) {
    forkJoin({
      usdGel: this.http.get<FrankfurterRate>('https://api.frankfurter.dev/v2/rate/USD/GEL'),
      gelUsd: this.http.get<FrankfurterRate>('https://api.frankfurter.dev/v2/rate/GEL/USD'),
    }).pipe(
      map(({ usdGel, gelUsd }) => {
        const direct = Number(usdGel.rate);
        const inverse = Number(gelUsd.rate);
        return direct > 0 ? direct : inverse > 0 ? 1 / inverse : 2.7;
      }),
      catchError(() => of(2.7)),
    ).subscribe((rate) => this.usdGelSubject.next(rate));
    this.http.get<FrankfurterRate>('https://api.frankfurter.dev/v2/rate/USD/EUR').pipe(
      map((rate) => (Number(rate.rate) > 0 ? Number(rate.rate) : 0.92)),
      catchError(() => of(0.92)),
    ).subscribe((rate) => (this.usdEurRate = rate));
  }

  private usdEurRate = 0.92;

  /** Current rates for converting budgets typed in GEL/EUR into USD listing prices. */
  get rates(): { usdGel: number; usdEur: number } {
    return { usdGel: this.usdGelSubject.value, usdEur: this.usdEurRate };
  }

}
