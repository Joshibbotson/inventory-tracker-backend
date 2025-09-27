import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/Auth.guard';
import { VerifiedUserGuard } from '../guards/Verified-user.guard';

/**
 * Decorator to protect routes that require both authentication and email verification
 */
export function RequireVerified() {
  return applyDecorators(UseGuards(AuthGuard, VerifiedUserGuard));
}
