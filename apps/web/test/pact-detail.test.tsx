// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PactDetail } from '../components/pact-detail';
import { SessionProvider } from '../components/session';
import { DraftForm } from '../components/draft-form';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
const unicode = 'José — आयुष “Café” → 🧾?';
it('renders the live form apostrophes and keeps legitimate question labels', () => {
  render(
    <SessionProvider configured>
      <DraftForm />
    </SessionProvider>,
  );
  expect(screen.getByLabelText('Other party’s email', { exact: true })).toBeTruthy();
  expect(screen.getByLabelText('What are you agreeing to?', { exact: true })).toBeTruthy();
  expect(document.body.textContent).toContain('you’re agreeing to');
  expect(document.body.textContent).not.toContain('\uFFFD');
});
function fixture() {
  return {
    id: 'pact-test',
    title: unicode,
    version: 1,
    status: 'ACTIVE',
    payment_condition: 'Ready?',
    transaction: {
      state: 'CREATED',
      amount_minor: '500000',
      currency: 'USD',
      payer_role: 'PARTY_A',
    },
    parties: [{ user_id: 'user-a', role: 'PARTY_A', display_name: unicode }],
    commitments: [],
    evidence: [],
    analyses: [],
    resolutions: [],
    audit: [],
  };
}
function mount(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher);
  render(
    <SessionProvider configured>
      <PactDetail id="pact-test" />
    </SessionProvider>,
  );
}
it('renders Unicode without corruption, preserves question marks, and reloads authoritative data', async () => {
  const record = fixture();
  let gets = 0;
  mount(
    vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/me')) return Response.json({ data: { id: 'user-a' } });
      if (url.endsWith('/capabilities'))
        return Response.json({ data: { paypal: true, workers: true } });
      gets++;
      return Response.json({
        data: { ...record, title: gets > 1 ? `${unicode} refreshed` : unicode },
      });
    }),
  );
  await screen.findByRole('heading', { name: unicode });
  expect(screen.getByText(`${unicode} · Party A`)).toBeTruthy();
  expect(document.body.textContent).not.toContain('\uFFFD');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
  await screen.findByRole('heading', { name: `${unicode} refreshed` });
  await screen.findByText(/Record refreshed from the server/);
  expect(gets).toBe(2);
});
it('reports failed refresh without inventing an updated record', async () => {
  let gets = 0;
  mount(
    vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/me')) return Response.json({ data: { id: 'user-a' } });
      if (url.endsWith('/capabilities'))
        return Response.json({ data: { paypal: true, workers: true } });
      gets++;
      return gets === 1
        ? Response.json({ data: fixture() })
        : Response.json({ error: { message: 'Server unavailable' } }, { status: 503 });
    }),
  );
  await screen.findByRole('heading', { name: unicode });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
  await screen.findByText('Server unavailable');
  expect(screen.queryByText(/Record refreshed from the server/)).toBeNull();
});
it('prevents duplicate clicks and surfaces the safe provider failure without claiming payment', async () => {
  let posts = 0;
  mount(
    vi.fn(async (input, options) => {
      const url = String(input);
      if (options?.method === 'POST') {
        posts++;
        return Response.json(
          {
            error: {
              message: 'PayPal cannot find the stored order with the configured Sandbox app.',
              reason: 'PAYPAL_ORDER_UNAVAILABLE',
            },
          },
          { status: 409 },
        );
      }
      return Response.json({
        data: url.endsWith('/me')
          ? { id: 'user-a' }
          : url.endsWith('/capabilities')
            ? { paypal: true, workers: true }
            : fixture(),
      });
    }),
  );
  const button = await screen.findByRole('button', { name: 'Capture approved Sandbox payment' });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText(/PayPal cannot find the stored order/);
  await waitFor(() => expect(posts).toBe(1));
  expect(document.body.textContent).toContain('Payment: created');
  expect(screen.queryByText(/Payment request queued/)).toBeNull();
  expect(
    screen
      .getByRole('link', { name: 'Create a new Pact for the current Sandbox app' })
      .getAttribute('href'),
  ).toBe('/workspace/new');
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Check existing checkout again' })).toBeTruthy();
});
