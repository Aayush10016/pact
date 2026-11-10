// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SessionProvider, ResourceState } from '../components/session';
import { PayPalAccount } from '../components/paypal-account';
const token = vi.hoisted(() => async () => 'test-only-token');
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: token, isLoaded: true, isSignedIn: true }),
  UserButton: () => null,
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('does not leave a loading message after a resource has loaded', () => {
  const view = render(<ResourceState loading={true} error="" retry={() => {}} />);
  expect(screen.getByRole('status')).toBeTruthy();
  view.rerender(<ResourceState loading={false} error="" retry={() => {}} />);
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<ResourceState loading={false} error="Connection interrupted" retry={() => {}} />);
  expect(screen.getByRole('alert').textContent).toContain('Connection interrupted');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});
it('explains missing platform setup without unusable consent or connection controls', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        data: {
          configured: false,
          status: 'NOT_CONNECTED',
          checkedAt: null,
          onboardingUrl: null,
        },
      }),
    ),
  );
  render(
    <SessionProvider configured>
      <PayPalAccount />
    </SessionProvider>,
  );
  await screen.findByRole('heading', { name: 'PayPal account connection is not available yet.' });
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue to PayPal Sandbox' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check connection with PayPal' })).toBeNull();
  expect(screen.queryByText('Loading your shared record.')).toBeNull();
  expect(screen.getByText(/No real money moves here/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Manage your services' })).toBeTruthy();
});
