import { Component, Input } from '@angular/core';
import { CurrencyService } from '../services/currency.service';

@Component({
  selector: 'app-currency-price',
  standalone: false,
  templateUrl: './currency-price.html',
  styleUrl: './currency-price.css',
})
export class CurrencyPrice {
  @Input({ required: true }) usdPrice = 0;
  @Input() suffix = '';
  currency: 'USD' | 'GEL' = 'USD';
  usdGelRate = 2.7;

  constructor(readonly currencyService: CurrencyService) {
    currencyService.usdGel$.subscribe((rate) => this.usdGelRate = rate);
  }

  get displayedPrice(): number {
    return this.currency === 'GEL' ? Number(this.usdPrice || 0) * this.usdGelRate : Number(this.usdPrice || 0);
  }
}
