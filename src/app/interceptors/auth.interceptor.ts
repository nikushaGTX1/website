import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();

  if (!token || isPublicReadRequest(req.method, req.url)) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  );
};

function isPublicReadRequest(method: string, url: string): boolean {
  if (method !== 'GET') {
    return false;
  }

  const requestUrl = new URL(url, window.location.origin);
  const publicPaths = new Set([
    '/api/Apartments',
    '/api/Agents',
    '/api/Blog',
    '/api/Locations',
    '/api/Locations/cities',
  ]);

  return publicPaths.has(requestUrl.pathname) || /^\/api\/Apartments\/\d+$/.test(requestUrl.pathname);
}
