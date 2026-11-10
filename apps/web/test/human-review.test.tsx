// @vitest-environment jsdom
import React from 'react';
import { afterEach, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionProvider } from '../components/session';
import { HumanReview, CaseConversation } from '../components/human-review';
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
it('explains an uncertain response and retries a case with the same request identifier', async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, options) => {
      const path = String(input);
      if (options?.method === 'POST') {
        bodies.push(JSON.parse(String(options.body)));
        if (bodies.length === 1) throw new TypeError('offline');
        return Response.json({ data: { id: 'case' } });
      }
      if (path.endsWith('/support/availability'))
        return Response.json({ data: { configured: true } });
      return Response.json({ data: [] });
    }),
  );
  render(
    <SessionProvider configured>
      <HumanReview pactId="pact" payer paymentState="CAPTURED" />
    </SessionProvider>,
  );
  const reason = await screen.findByLabelText('Explain what happened');
  fireEvent.change(reason, { target: { value: 'The agreed delivery never arrived.' } });
  fireEvent.change(screen.getByLabelText('What do you need?'), { target: { value: 'REFUND' } });
  fireEvent.click(screen.getByRole('button', { name: 'Request human help' }));
  await screen.findByText(/Connection interrupted/);
  expect(screen.queryByText(/Saved on the server/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Request human help' }));
  await screen.findByText(/Saved on the server/);
  expect(bodies[0]!.requestId).toBe(bodies[1]!.requestId);
  expect(bodies[0]!.kind).toBe('REFUND');
});
it('shows a party their private conversation and the shared decision without refund success claims', async () => {
  const c = {
    id: 'case',
    pact_id: 'pact',
    status: 'DECIDED',
    version: 3,
    assigned_to: 'staff',
    reviewer_name: 'Reviewer',
    response_deadline: '2026-10-14T12:00:00Z',
    parties: [],
    evidence: [],
    transaction: { payer_role: 'PARTY_A' },
    messages: [
      {
        id: 'message',
        sender_name: 'Reviewer',
        body: 'Your evidence was reviewed.',
        created_at: '2026-10-11T12:00:00Z',
        evidence_version_ids: [],
      },
    ],
    decision: {
      reason: 'Both parties were heard and the requested delivery was not provided.',
      proposal: { type: 'FULL_REFUND' },
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) =>
      Response.json({ data: String(input).endsWith('/me') ? { id: 'buyer' } : c }),
    ),
  );
  render(
    <SessionProvider configured>
      <CaseConversation caseId="case" />
    </SessionProvider>,
  );
  await screen.findByText('Your evidence was reviewed.');
  expect(screen.getByText(/Refund authorized. Check Financial records/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send to reviewer' })).toBeNull();
});
it('keeps staff conversations separated when switching between the two parties', async () => {
  const c = {
    id: 'case',
    pact_id: 'pact',
    status: 'IN_REVIEW',
    version: 3,
    assigned_to: 'staff',
    reviewer_name: 'Reviewer',
    response_deadline: '2026-10-14T12:00:00Z',
    parties: [
      { user_id: 'buyer', display_name: 'Buyer', role: 'PARTY_A' },
      { user_id: 'seller', display_name: 'Seller', role: 'PARTY_B' },
    ],
    transaction: { payer_role: 'PARTY_A' },
    evidence: [],
    decision: null,
    messages: [
      {
        id: 'buyer-message',
        audience_id: 'buyer',
        sender_name: 'Buyer',
        body: 'Private buyer story.',
        created_at: '2026-10-11T12:00:00Z',
        evidence_version_ids: [],
      },
      {
        id: 'seller-message',
        audience_id: 'seller',
        sender_name: 'Seller',
        body: 'Private seller story.',
        created_at: '2026-10-11T12:00:00Z',
        evidence_version_ids: [],
      },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) =>
      Response.json({ data: String(input).endsWith('/me') ? { id: 'staff' } : c }),
    ),
  );
  render(
    <SessionProvider configured>
      <CaseConversation caseId="case" staff />
    </SessionProvider>,
  );
  await screen.findByText('Private buyer story.');
  expect(screen.queryByText('Private seller story.')).toBeNull();
  fireEvent.change(screen.getByLabelText('Conversation with'), { target: { value: 'seller' } });
  await waitFor(() => expect(screen.getByText('Private seller story.')).toBeTruthy());
  expect(screen.queryByText('Private buyer story.')).toBeNull();
});
