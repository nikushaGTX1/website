import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  // Signed-in users send their token on a single apartment: staff get the owner contact, and
  // owners can open their own listing while it waits for approval (e.g. to edit it).
  const staff = !!token;

  if (!token || isPublicReadRequest(req.method, req.url, staff)) {
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

function isPublicReadRequest(method: string, url: string, staff = false): boolean {
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

  return publicPaths.has(requestUrl.pathname) || (!staff && /^\/api\/Apartments\/\d+$/.test(requestUrl.pathname));
}
