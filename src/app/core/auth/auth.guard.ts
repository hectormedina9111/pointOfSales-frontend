import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Sin sesión, va a /login. Con la contraseña pendiente, va a /change-password, salvo que la
 * ruta lo permita (data.allowPendingPassword).
 */
export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  if (auth.mustChangePassword() && route.data['allowPendingPassword'] !== true) {
    return router.createUrlTree(['/change-password']);
  }
  return true;
};
