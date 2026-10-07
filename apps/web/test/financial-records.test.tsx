// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReceiptDocument } from '../components/financial-receipt';
import { ActivityView } from '../components/activity-view';
import { SessionProvider } from '../components/session';
import type { FinancialReceipt } from '@pact/types';
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
const receipt: FinancialReceipt = {
  id: 'tx-test',
  kind: 'payment',
  status: 'COMPLETED',
  provider: 'PayPal Sandbox',
  pactId: 'pact-test',
  pactTitle: 'A shared promise',
  amountMinor: '1000000',
  currency: 'USD',
  orderId: 'ORDER-FROM-PROVIDER',
  captureId: 'CAPTURE-FROM-PROVIDER',
  refundId: null,
  occurredAt: '2026-10-07T08:00:00Z',
  confirmedAt: '2026-10-07T08:01:00Z',
  payer: 'José',
  payee: 'आयुष',
};
it('renders a payment receipt with the exact supplied confirmed identifiers, amount and parties', () => {
  render(<ReceiptDocument receipt={receipt} />);
  expect(screen.getByRole('heading', { name: 'Payment completed.' })).toBeTruthy();
  for (const value of [
    'ORDER-FROM-PROVIDER',
    'CAPTURE-FROM-PROVIDER',
    'COMPLETED / CAPTURED',
    'José',
    'आयुष',
  ])
    expect(screen.getByText(value)).toBeTruthy();
  expect(document.body.textContent).toContain('10,000.00');
  expect(document.body.textContent).toContain('USD');
  expect(screen.queryByText('PayPal Refund ID')).toBeNull();
});
it('renders the linked refund receipt without inventing a missing provider timestamp', () => {
  render(
    <ReceiptDocument
      receipt={{
        ...receipt,
        id: 'refund-op',
        kind: 'refund',
        refundId: 'REFUND-FROM-PROVIDER',
        occurredAt: null,
      }}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Refund completed.' })).toBeTruthy();
  for (const value of [
    'ORDER-FROM-PROVIDER',
    'CAPTURE-FROM-PROVIDER',
    'REFUND-FROM-PROVIDER',
    'Timestamp not provided by PayPal',
  ])
    expect(screen.getByText(value)).toBeTruthy();
  expect(document.body.textContent).toContain('10,000.00');
});
it('links only final financial Activity rows to their exact receipt, never to Pact detail', async () => {
  const intermediate = [
    'Payment capture requested',
    'Payment submitted to PayPal',
    'Payment update received from PayPal',
    'Refund requested',
    'Refund approved by both parties',
    'Refund processing',
    'Refund submitted to PayPal',
    'Refund update received from PayPal',
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        data: [
          ...intermediate.map((label, i) => ({
            id: String(i),
            pact_id: 'pact-test',
            title: 'A shared promise',
            created_at: '2026-10-07T08:00:00Z',
            label,
            receipt: null,
          })),
          ...(['payment', 'refund'] as const).map((kind) => ({
            id: kind,
            pact_id: 'pact-test',
            title: 'A shared promise',
            created_at: '2026-10-07T08:00:00Z',
            label: kind === 'payment' ? 'Payment completed' : 'Refund completed',
            receipt: {
              id: kind === 'payment' ? 'tx-test' : 'refund-op',
              kind,
              amountMinor: '1000000',
              currency: 'USD',
            },
          })),
        ],
      }),
    ),
  );
  render(
    <SessionProvider configured>
      <ActivityView />
    </SessionProvider>,
  );
  await screen.findByRole('heading', { name: 'Refund completed' });
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(2);
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/workspace/pacts/pact-test/receipts/payment/tx-test',
    '/workspace/pacts/pact-test/receipts/refund/refund-op',
  ]);
  for (const label of intermediate)
    expect(
      screen.getByRole('heading', { name: label }).closest('article')?.querySelector('a'),
    ).toBeNull();
});
