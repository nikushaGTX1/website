import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  // Staff need their token on a single apartment: the API only returns the owner contact to them.
  const staff = !!token && auth.hasAnyRole(['agent', 'manager', 'crm-manager', 'crm_manager', 'admin']);

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
