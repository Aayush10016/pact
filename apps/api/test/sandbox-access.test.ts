import { afterEach, it, expect } from 'vitest';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { assertSandboxTester } from '../src/auth/sandbox-access';
const original = process.env.PACT_TESTER_EMAILS;
afterEach(() => {
  if (original === undefined) delete process.env.PACT_TESTER_EMAILS;
  else process.env.PACT_TESTER_EMAILS = original;
});
it('preserves existing local member access when the optional gate is unset', () => {
  delete process.env.PACT_TESTER_EMAILS;
  expect(() => assertSandboxTester('local@example.com')).not.toThrow();
});
it('admits exact verified tester emails with case and whitespace normalization', () => {
  process.env.PACT_TESTER_EMAILS = ' Owner@example.com , partner@example.com ';
  expect(() => assertSandboxTester('OWNER@example.com')).not.toThrow();
  expect(() => assertSandboxTester('owner@example.com.attacker.test')).toThrow(ForbiddenException);
  expect(() => assertSandboxTester('outsider@example.com')).toThrow(ForbiddenException);
});
it('fails closed for malformed or whitespace-only access configuration', () => {
  process.env.PACT_TESTER_EMAILS = ' , ';
  expect(() => assertSandboxTester('owner@example.com')).toThrow(ServiceUnavailableException);
  process.env.PACT_TESTER_EMAILS = 'invalid';
  expect(() => assertSandboxTester('owner@example.com')).toThrow(ServiceUnavailableException);
});
