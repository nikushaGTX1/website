import {
  HttpEvent,
  HttpInterceptorFn,
} from '@angular/common/http';
import { Observable, finalize, shareReplay } from 'rxjs';

const inFlightGets = new Map<string, Observable<HttpEvent<unknown>>>();

export const apiPerformanceInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.method !== 'GET' || !request.url.startsWith('/api/')) {
    return next(request);
  }

  const cacheKey = [
    request.urlWithParams,
    request.headers.get('Authorization') || 'public',
  ].join('|');
  const existingRequest = inFlightGets.get(cacheKey);

  if (existingRequest) {
    return existingRequest;
  }

  const sharedRequest = next(request).pipe(
    finalize(() => inFlightGets.delete(cacheKey)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  inFlightGets.set(cacheKey, sharedRequest);
  return sharedRequest;
};
