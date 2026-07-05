import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Apartment, CreateApartment } from '../models/apartment';
import { API_URL } from '../utils/api-config';

@Injectable({
  providedIn: 'root'
})
export class ApartmentService {
  private apiUrl = `${API_URL}/Apartments`;

  constructor(private http: HttpClient) {}

  getApartments(): Observable<Apartment[]> {
    return this.http.get<Apartment[]>(this.apiUrl);
  }

  getApartment(id: number): Observable<Apartment> {
    return this.http.get<Apartment>(`${this.apiUrl}/${id}`);
  }

  createApartment(data: CreateApartment): Observable<any> {
    return this.http.post(this.apiUrl, this.toApartmentFormData(data));
  }

  updateApartment(id: number, data: Partial<CreateApartment>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, this.toApartmentFormData(data));
  }

  deleteApartment(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  private toApartmentFormData(data: Partial<CreateApartment>): FormData {
    const formData = new FormData();

    if (data.title !== undefined) {
      formData.append('Title', data.title);
    }

    if (data.description !== undefined) {
      formData.append('Description', data.description);
    }

    if (data.price !== undefined) {
      formData.append('Price', String(data.price));
    }

    if (data.address !== undefined) {
      formData.append('Address', data.address || '');
    }

    const image = data.imageFile || this.dataUrlToFile(data.imageUrl);
    if (image) {
      formData.append('Image', image, image.name);
    }

    return formData;
  }

  private dataUrlToFile(value?: string): File | null {
    if (!value?.startsWith('data:image/')) {
      return null;
    }

    const [metadata, base64Data] = value.split(',');
    const mimeType = metadata.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binary = atob(base64Data || '');
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], 'apartment-image.jpg', { type: mimeType });
  }
}
