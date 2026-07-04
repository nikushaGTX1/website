import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ApartmentService } from '../services/apartment.service';
import { Apartment } from '../models/apartment';

@Component({
  selector: 'app-main',
  standalone: false,
  templateUrl: './main.html',
  styleUrl: './main.css',
})
export class Main implements OnInit {
  apartments: Apartment[] = [];
  loading = true;

  constructor(
    private apartmentService: ApartmentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('MAIN LOADED');
    this.loadApartments();
  }

  loadApartments(): void {
    this.loading = true;

    this.apartmentService.getApartments().subscribe({
      next: (data) => {
        console.log('Apartments loaded:', data);
        this.apartments = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Apartment API error:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}