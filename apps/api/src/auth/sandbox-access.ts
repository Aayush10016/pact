import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
export function assertSandboxTester(email: string) {
  const configured = process.env.PACT_TESTER_EMAILS;
  if (!configured) return; // Public verified-member registration. Private Pact membership and staff authorization remain enforced separately.
  const allowed = configured
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length || allowed.some((value) => !z.email().safeParse(value).success))
    throw new ServiceUnavailableException('Sandbox tester access is not configured correctly.');
  if (!allowed.includes(email.trim().toLowerCase()))
    throw new ForbiddenException('This Sandbox is limited to invited testers.');
}
