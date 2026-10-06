import { Injectable, Module, ForbiddenException, type CanActivate } from '@nestjs/common';
@Injectable()
export class AuthenticationGuard implements CanActivate {
  canActivate(): boolean {
    // Never accept an unverified bearer token or a client-supplied identity.
    // Phase 2: integrate Clerk JWT verification, issuer/audience checks, and party ownership.
    throw new ForbiddenException('Authenticated workflows are unavailable in this foundation.');
  }
}
@Module({ providers: [AuthenticationGuard], exports: [AuthenticationGuard] })
export class AuthModule {}
