import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const agentGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAgent) {
    return true;
  }

  return router.createUrlTree(['/main']);
};

/** CRM is available to managers, working agents, and read-only uploaders. */
export const crmGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.canOpenCrm
    ? true
    : router.createUrlTree(['/main']);
};
