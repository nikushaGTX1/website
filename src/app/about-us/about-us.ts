import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApartmentService } from '../services/apartment.service';

@Component({
  selector: 'app-about-us',
  standalone: false,
  templateUrl: './about-us.html',
  styleUrl: './about-us.css',
})
export class AboutUs {
  email = '';
  totalPropertyValue: number | null = null;

  constructor(private apartmentService: ApartmentService) {
    this.apartmentService.getApartments().subscribe({
      next: (apartments) => {
        this.totalPropertyValue = apartments.reduce((total, apartment) => {
          const price = Number(apartment.price);
          return total + (Number.isFinite(price) && price > 0 ? price : 0);
        }, 0);
      },
      error: () => {
        this.totalPropertyValue = 0;
      },
    });
  }

  get formattedTotalPropertyValue(): string {
    if (this.totalPropertyValue === null) return '—';

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(this.totalPropertyValue);
  }

  onSubscribe(): void {
    if (this.email) {
      alert(`Subscribed successfully with: ${this.email}`);
      this.email = '';
    }
  }
}
