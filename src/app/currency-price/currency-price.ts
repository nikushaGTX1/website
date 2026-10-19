import { Component, Input } from '@angular/core';
import { CurrencyService } from '../services/currency.service';
import { NgIf, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-currency-price',
  templateUrl: './currency-price.html',
  styleUrl: './currency-price.css',
  imports: [NgIf, DecimalPipe],
})
export class CurrencyPrice {
  @Input({ required: true }) usdPrice = 0;
  @Input() suffix = '';
  @Input() showApproximate = true;
  usdGelRate = 2.7;

  constructor(readonly currencyService: CurrencyService) {
    currencyService.usdGel$.subscribe((rate) => (this.usdGelRate = rate));
  }
}
