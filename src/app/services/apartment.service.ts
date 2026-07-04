import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Apartment, CreateApartment } from '../models/apartment';

@Injectable({
  providedIn: 'root'
})
export class ApartmentService {
  private apiUrl = 'https://localhost:7111/api/apartments';

  constructor(private http: HttpClient) {}

  getApartments(): Observable<Apartment[]> {
    return this.http.get<Apartment[]>(this.apiUrl);
  }

  getApartment(id: number): Observable<Apartment> {
    return this.http.get<Apartment>(`${this.apiUrl}/${id}`);
  }

  createApartment(data: CreateApartment): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  updateApartment(id: number, data: Partial<CreateApartment>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  deleteApartment(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}