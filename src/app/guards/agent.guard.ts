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

/** CRM lets uploaders create leads and view only leads connected to their account. */
export const crmGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.canOpenCrm
    ? true
    : router.createUrlTree(['/main']);
};
