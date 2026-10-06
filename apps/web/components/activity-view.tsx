'use client';
import Link from 'next/link';
import { FileText, ArrowUpRight } from 'lucide-react';
import { AccessGate, useResource, ResourceState } from './session';
export function ActivityView() {
  return (
    <AccessGate>
      <Activity />
    </AccessGate>
  );
}
function Activity() {
  const r =
    useResource<
      Array<{ id: string; pact_id: string; title: string; event_type: string; created_at: string }>
    >('activity');
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A RECORD YOU CAN FOLLOW.</p>
          <h1>Every step, in context.</h1>
          <p className="muted">Persisted events from the agreements you belong to.</p>
        </div>
      </div>
      {r.error || r.loading ? (
        <ResourceState loading={r.loading} error={r.error} retry={r.reload} />
      ) : !r.data?.length ? (
        <div className="empty-state" role="status">
          <h2>No activity yet.</h2>
          <p>Your first Pact will begin the record.</p>
        </div>
      ) : (
        <div className="activity-list">
          {r.data.map((a) => (
            <article key={a.id}>
              <span className="mono">{new Date(a.created_at).toLocaleDateString()}</span>
              <FileText size={20} />
              <div>
                <h2>{a.event_type.replaceAll('_', ' ').toLowerCase()}</h2>
                <p>{a.title}</p>
              </div>
              <Link href={`/workspace/pacts/${a.pact_id}`} aria-label={`Open ${a.title}`}>
                <ArrowUpRight size={20} />
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
