'use client';
import Link from 'next/link';
import styles from './record-panels.module.css';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@pact/shared';
import { AccessGate, useApi, useResource, ResourceState } from './session';
export function InvitationView({ id }: { id: string }) {
  return (
    <AccessGate>
      <Invitation id={id} />
    </AccessGate>
  );
}
function Invitation({ id }: { id: string }) {
  const r = useResource<{
    pact_id: string;
    title: string;
    agreement: string;
    payment_condition: string;
    amount_minor: string;
    currency: string;
    payer_role: string;
    commitments: Array<{
      id: string;
      title: string;
      description: string;
      acceptance_criteria: string;
      expected_evidence: string;
    }>;
  }>(`invitations/${id}`);
  const api = useApi();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    try {
      const result = await api<{ id: string }>(`invitations/${id}/accept`, {
        method: 'POST',
        body: '{}',
      });
      router.push(`/workspace/pacts/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to accept.');
    } finally {
      setBusy(false);
    }
  }
  if (!r.data || r.loading || r.error)
    return <ResourceState loading={r.loading} error={r.error} retry={r.reload} />;
  const p = r.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REVIEW BEFORE JOINING</p>
          <h1>{p.title}</h1>
          <p className="muted">This invitation is matched to your verified email.</p>
        </div>
      </div>
      <div className="form-layout">
        <div className={styles.invitation}>
          <h2>A shared definition of done.</h2>
          <p>{p.agreement}</p>
          {p.commitments.map((c) => (
            <article className={styles.card} key={c.id}>
              <h3>{c.title}</h3>
              <p>{c.description}</p>
              <p>Acceptance: {c.acceptance_criteria}</p>
              <p>Evidence: {c.expected_evidence}</p>
            </article>
          ))}
          <p className="mono">
            Agreed amount: {formatMoney({ amountMinor: p.amount_minor, currency: p.currency })}
          </p>
          <p>{p.payment_condition}</p>
          <p>
            {p.payer_role === 'PARTY_B' ? 'You are the payer.' : 'The creator is the payer.'}{' '}
            Accepting creates membership; it does not authorize money movement.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="hero-actions">
            <button className="button secondary" disabled={busy} onClick={accept}>
              Accept this Pact
            </button>
            <Link className="button secondary" href="/workspace">
              Return without accepting
            </Link>
          </div>
        </div>
        <aside className="form-aside">
          <h2>
            A deliberate
            <br />
            beginning.
          </h2>
          <p>
            Review scope, evidence expectations, value, and payment conditions. Checkout and
            resolution approvals are separate decisions.
          </p>
        </aside>
      </div>
    </>
  );
}
