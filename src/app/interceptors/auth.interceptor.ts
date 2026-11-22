import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  // Signed-in users send their token on a single apartment: staff get the owner contact, and
  // owners can open their own listing while it waits for approval (e.g. to edit it).
  const staff = !!token;

  // The token only ever goes to Velven's own API on this site, never to outside services
  // (currency rates, maps, image hosts).
  if (!token || !isOwnApi(req.url) || isPublicReadRequest(req.method, req.url, staff)) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  ).pipe(
    catchError((error) => {
      // The session was ended on the server (password reset, role change, removed agent):
      // sign out here too instead of failing every request until the token expires.
      if (error?.status === 401 && auth.getToken() === token) auth.logout();
      return throwError(() => error);
    }),
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

/** Same-origin requests under /api only. */
function isOwnApi(url: string): boolean {
  try {
    const target = new URL(url, window.location.origin);
    return target.origin === window.location.origin && target.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}
