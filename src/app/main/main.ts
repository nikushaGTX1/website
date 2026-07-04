import { Component, OnInit } from '@angular/core';
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

  constructor(private apartmentService: ApartmentService) {}

  ngOnInit(): void {
    this.loadApartments();
  }

  loadApartments(): void {
    this.apartmentService.getApartments().subscribe({
      next: (data) => {
        this.apartments = data;
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
      }
    });
  }
}