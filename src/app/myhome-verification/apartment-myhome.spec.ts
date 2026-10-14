import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ApartmentService } from '../services/apartment.service';
import { CreateApartment } from '../models/apartment';

test('upload and edit send normalized MyHome ID without changing other fields', () => {
  const requests: { method: string; url: string; body: FormData }[] = [];
  const http = {
    post: (url: string, body: FormData) => {
      requests.push({ method: 'POST', url, body });
      return of({ message: 'created' });
    },
    put: (url: string, body: FormData) => {
      requests.push({ method: 'PUT', url, body });
      return of({ message: 'updated' });
    },
  } as unknown as HttpClient;
  const service = new ApartmentService(http);
  service.createApartment({
    title: 'Original title',
    description: 'Original copy',
    price: 1200,
    myHomeId: ' 12345678 ',
  } as CreateApartment);
  service.updateApartment(7, { myHomeId: ' 87654321 ' });
  service.updateApartment(7, { title: 'Edited title' });
  service.updateApartment(7, { myHomeId: '' });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body.get('MyHomeId'), '12345678');
  assert.equal(requests[0].body.get('Title'), 'Original title');
  assert.equal(requests[0].body.get('Description'), 'Original copy');
  assert.equal(requests[0].body.get('Price'), '1200');
  assert.equal(requests[1].body.get('MyHomeId'), '87654321');
  assert.equal(requests[1].body.has('Price'), false);
  assert.equal(requests[2].body.has('MyHomeId'), false, 'omitted field preserves an existing link');
  assert.equal(requests[3].body.get('MyHomeId'), '', 'explicit empty field clears a link');
});
