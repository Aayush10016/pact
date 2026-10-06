'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight, ArrowUpRight } from 'lucide-react';
import { formatMoney } from '@pact/shared';
import { AccessGate, useResource, ResourceState } from './session';
interface Summary {
  id: string;
  title: string;
  status: string;
  other_party: string | null;
  amount_minor: string;
  currency: string;
  payment_state: string;
  deadline: string | null;
}
interface Invitation {
  id: string;
  pact_id: string;
  title: string;
}
export function WorkspaceView() {
  return (
    <AccessGate>
      <PrivateWorkspace />
    </AccessGate>
  );
}
function PrivateWorkspace() {
  const records = useResource<Summary[]>('pacts');
  const invitations = useResource<Invitation[]>('me/invitations');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All pacts');
  const visible =
    records.data?.filter(
      (p) =>
        (filter === 'All pacts' ||
          (filter === 'In progress' && p.status === 'ACTIVE') ||
          (filter === 'Needs attention' && ['CREATED', 'DISPUTED'].includes(p.status))) &&
        `${p.title} ${p.other_party || ''}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORK, ON THE SAME PAGE.</p>
          <h1>Your pacts.</h1>
          <p className="muted">A clear view of the promises in progress.</p>
        </div>
        <span className="mono sample-label">PRIVATE RECORDS</span>
      </div>
      {invitations.error && (
        <p className="form-error" role="alert">
          {invitations.error}
          <button className="text-link" onClick={invitations.reload}>
            Retry invitations
          </button>
        </p>
      )}
      {invitations.data?.map((i) => (
        <section key={i.id} className="attention-panel">
          <div>
            <span className="eyebrow">INVITATION TO A SHARED RECORD</span>
            <h2>{i.title}</h2>
            <p>Review the agreement before joining. Accepting does not authorize a payment.</p>
            <Link className="text-link" href={`/workspace/invitations/${i.id}`}>
              Review invitation <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      ))}
      {records.loading || records.error ? (
        <ResourceState loading={records.loading} error={records.error} retry={records.reload} />
      ) : (
        <section aria-labelledby="pacts-title" className="pacts-section">
          <div className="section-toolbar">
            <h2 id="pacts-title">
              Agreements <span className="count">{records.data?.length ?? 0}</span>
            </h2>
            <label className="search">
              <Search size={16} />
              <span className="sr-only">Search pacts</span>
              <input
                type="search"
                placeholder="Find a pact or person"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="filters" role="group" aria-label="Filter pacts">
            {['All pacts', 'Needs attention', 'In progress'].map((label) => (
              <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>
                {label}
              </button>
            ))}
          </div>
          {visible.length ? (
            <div className="pact-table">
              <div className="pact-table-head" aria-hidden="true">
                <span>PACT / OTHER PARTY</span>
                <span>AGREEMENT</span>
                <span>AGREED AMOUNT</span>
                <span>PAYMENT</span>
                <span />
              </div>
              {visible.map((p) => (
                <article className="pact-row" key={p.id}>
                  <div className="pact-name">
                    <span className="avatar">
                      {(p.other_party || 'Pending').slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <Link href={`/workspace/pacts/${p.id}`}>{p.title}</Link>
                      <p>{p.other_party || 'Counterparty acceptance pending'}</p>
                    </div>
                  </div>
                  <span className={`badge ${p.status === 'DISPUTED' ? 'warning' : 'neutral'}`}>
                    {p.status.replaceAll('_', ' ').toLowerCase()}
                  </span>
                  <span className="mono pact-money">
                    {formatMoney({ amountMinor: p.amount_minor, currency: p.currency })}
                  </span>
                  <div className="milestone-cell">
                    <span className="mono">{p.payment_state.toLowerCase()}</span>
                    <p>{p.deadline ? new Date(p.deadline).toLocaleDateString() : 'No deadline'}</p>
                  </div>
                  <Link
                    className="row-arrow"
                    href={`/workspace/pacts/${p.id}`}
                    aria-label={`Open ${p.title}`}
                  >
                    <ArrowUpRight size={20} />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state" role="status">
              <Search size={24} />
              <h3>{records.data?.length ? 'No pacts match.' : 'Your next promise starts here.'}</h3>
              <p>
                {records.data?.length
                  ? 'Try another name or choose a different filter.'
                  : 'Create an agreement with clear commitments. It will appear here after it is saved.'}
              </p>
              {records.data?.length ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setQuery('');
                    setFilter('All pacts');
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link className="button" href="/workspace/new">
                  Create your first Pact
                </Link>
              )}
            </div>
          )}
        </section>
      )}
      <div className="workspace-bottom">
        <section>
          <h2>A record you can follow.</h2>
          <p className="muted">
            Activity comes from persisted Pact events, rather than sample metrics.
          </p>
          <Link className="text-link" href="/workspace/activity">
            View your audit history <ArrowRight size={16} />
          </Link>
        </section>
        <section>
          <h2>Payment follows consent.</h2>
          <p className="muted">
            AI recommendations are advisory. Both parties must approve the exact resolution before a
            financial action is submitted.
          </p>
        </section>
      </div>
    </>
  );
}
