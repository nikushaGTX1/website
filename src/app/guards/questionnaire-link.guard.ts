import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { API_URL } from '../utils/api-config';

/**
 * The root short-link route (velven.ge/{slug}) only matches live questionnaire links.
 * Anything else falls through to the 404 page instead of rendering the form (VELVEN-012).
 * If the check itself fails, the link is allowed so real short links never break.
 */
export const questionnaireLinkGuard: CanMatchFn = (_route, segments) => {
  const value = segments[0]?.path?.trim() || '';
  if (!/^(agent-)?[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value)) return false;
  return inject(HttpClient)
    .get<{ active?: boolean }>(`${API_URL}/Crm/questionnaire-links/${encodeURIComponent(value)}/status`)
    .pipe(
      map((status) => status?.active !== false),
      catchError(() => of(true)),
    );
};
