'use client';
import Link from 'next/link';
import { formatMoney } from '@pact/shared';
import { useEffect, useRef, useState } from 'react';
import { AccessGate, useApi, useResource, ResourceState } from './session';
import styles from './human-review.module.css';
type Case = {
  id: string;
  pact_id: string;
  kind: string;
  reason: string;
  status: string;
  version: number;
  assigned_to: string | null;
  reviewer_name: string | null;
  response_deadline: string;
  title?: string;
};
type Detail = Case & {
  parties: { user_id: string; display_name: string; role: string }[];
  transaction: { state: string; amount_minor: string; currency: string; payer_role: string };
  messages: {
    id: string;
    sender_name: string;
    audience_id: string;
    body: string;
    created_at: string;
    evidence_version_ids: string[];
  }[];
  decision: null | {
    reason: string;
    response_override_reason?: string;
    proposal: { type: string; amountMinor: string; currency: string };
  };
  evidence: { id: string; content: string }[];
  pact?: {
    title: string;
    agreement: string;
    commitments: { title: string; description: string; acceptance_criteria: string }[];
  };
};
function useCommand(reload: () => void) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const guard = useRef(false);
  const pending = useRef<{ payload: string; id: string } | null>(null);
  async function send(path: string, value: Record<string, unknown>, dedupe = false) {
    if (guard.current) return false;
    guard.current = true;
    setBusy(true);
    setFeedback('');
    const payload = JSON.stringify(value);
    if (dedupe && pending.current?.payload !== payload)
      pending.current = { payload, id: crypto.randomUUID() };
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ ...value, ...(dedupe ? { requestId: pending.current!.id } : {}) }),
      });
      pending.current = null;
      setFeedback('Saved on the server. Refresh shows the latest status.');
      reload();
      return true;
    } catch (e) {
      setFeedback(
        e instanceof Error ? e.message : 'Request could not be confirmed. Refresh before retrying.',
      );
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return { send, busy, feedback };
}
export function HumanReview({
  pactId,
  paymentState,
  payer,
  closed = false,
}: {
  pactId: string;
  paymentState: string;
  payer: boolean;
  closed?: boolean;
}) {
  const cases = useResource<Case[]>(`pacts/${pactId}/support`);
  const settings = useResource<{ configured: boolean }>(`pacts/${pactId}/support/availability`);
  const [selected, setSelected] = useState<string | null>(null);
  const cmd = useCommand(cases.reload);
  useEffect(() => {
    if (!Array.isArray(cases.data) || !cases.data.some((c) => c.status !== 'DECIDED')) return;
    const timer = setInterval(cases.reload, 10000);
    return () => clearInterval(timer);
  }, [cases.data, cases.reload]);
  if (!cases.data) return <ResourceState {...cases} retry={cases.reload} />;
  const active = cases.data.find((c) => c.status !== 'DECIDED');
  return (
    <section id="human-review" className={styles.panel} aria-label="Human review">
      <p className="eyebrow">A person can help</p>
      <h2>Ask for human review</h2>
      <p>
        A Pact reviewer can hear both sides and decide a delivery or refund concern. The other party
        cannot veto a reviewer-authorized refund. This is a Pact review, not a PayPal dispute.
      </p>
      {settings.data && !settings.data.configured && (
        <p>
          No independent reviewer is configured for this Pact yet. Requests can be saved, but a
          response time or refund is not promised.
        </p>
      )}
      {settings.error && (
        <p role="alert">
          Reviewer availability could not be checked. Refresh review status before relying on
          assignment. {settings.error}
        </p>
      )}
      {active ? (
        <p>
          Review {active.status === 'OPEN' ? 'is waiting for assignment' : 'has a reviewer'}.
          Continue the conversation below.
        </p>
      ) : (
        !closed && (
          <form
            className="draft-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const d = new FormData(f);
              if (
                await cmd.send(
                  `pacts/${pactId}/support`,
                  { kind: d.get('kind'), reason: d.get('reason') },
                  true,
                )
              )
                f.reset();
            }}
          >
            <label>
              What do you need?
              <select name="kind">
                <option value="RESOLUTION">Help resolve the agreement</option>
                {payer && paymentState === 'CAPTURED' && (
                  <option value="REFUND">Review a refund request</option>
                )}
              </select>
            </label>
            <label>
              Explain what happened
              <textarea name="reason" required minLength={10} maxLength={2000} />
            </label>
            <p>
              The case reason and decision are shared with both parties. Messages are private to you
              and the reviewer. Upload files in Evidence before referring to them here.
            </p>
            <button className="button" disabled={cmd.busy}>
              Request human help
            </button>
          </form>
        )
      )}
      {cmd.feedback && <p role="status">{cmd.feedback}</p>}
      <button className="button secondary" onClick={cases.reload}>
        Refresh review status
      </button>
      <ul className={styles.caseList}>
        {cases.data.map((c) => (
          <li key={c.id}>
            <button className="text-link" onClick={() => setSelected(c.id)}>
              {c.kind === 'REFUND' ? 'Refund review' : 'Resolution review'} ·{' '}
              {c.status === 'DECIDED'
                ? 'Decision recorded'
                : c.status === 'OPEN'
                  ? 'Waiting for reviewer'
                  : 'In review'}
            </button>
            <p>{c.reason}</p>
          </li>
        ))}
      </ul>
      {(selected || active) && (
        <CaseConversation key={selected ?? active!.id} caseId={selected ?? active!.id} />
      )}
    </section>
  );
}
export function CaseConversation({ caseId, staff = false }: { caseId: string; staff?: boolean }) {
  const path = staff ? `staff/cases/${caseId}` : `support/${caseId}`;
  const record = useResource<Detail>(path);
  const api = useApi();
  const me = useResource<{ id: string }>('me');
  const cmd = useCommand(record.reload);
  const [audience, setAudience] = useState('');
  const [downloadError, setDownloadError] = useState('');
  useEffect(() => {
    const timer = setInterval(record.reload, 10000);
    return () => clearInterval(timer);
  }, [record.reload]);
  if (!record.data) return <ResourceState {...record} retry={record.reload} />;
  const c = record.data;
  const target = audience || c.parties[0]?.user_id;
  const messages = staff ? c.messages.filter((m) => m.audience_id === target) : c.messages;
  return (
    <section className={styles.conversation}>
      <h3>{staff ? 'Review workspace' : 'Your conversation with Pact'}</h3>
      {c.transaction.amount_minor && c.transaction.currency && (
        <p>
          Payment record:{' '}
          {formatMoney({
            amountMinor: c.transaction.amount_minor,
            currency: c.transaction.currency,
          })}{' '}
          · {c.transaction.state.toLowerCase()}
        </p>
      )}
      {downloadError && <p role="alert">{downloadError}</p>}
      <p>
        {c.reviewer_name
          ? `Reviewer: ${c.reviewer_name}`
          : 'Waiting for reviewer assignment. You can add your explanation now.'}
      </p>
      <p>
        {c.assigned_to
          ? `Response window ends ${new Date(c.response_deadline).toLocaleString()}.`
          : 'The response window starts when a reviewer is assigned.'}{' '}
        The reviewer contacts both parties and may review a lack of response after this deadline.
      </p>
      {record.error && <p role="alert">{record.error}</p>}
      <button className="button secondary" onClick={record.reload}>
        Refresh conversation
      </button>
      {staff && !c.assigned_to && c.status !== 'DECIDED' && (
        <button
          className="button"
          disabled={cmd.busy}
          onClick={() => void cmd.send(`${path}/claim`, {})}
        >
          Claim this case
        </button>
      )}
      {staff && (
        <label>
          Conversation with
          <select value={target} onChange={(e) => setAudience(e.target.value)}>
            {c.parties.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.display_name} · {p.role === c.transaction.payer_role ? 'Payer' : 'Other party'}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={styles.messages} aria-live="polite">
        {messages.length ? (
          messages.map((m) => (
            <article key={m.id}>
              <strong>{m.sender_name}</strong>
              <time>{new Date(m.created_at).toLocaleString()}</time>
              <p className={styles.messageBody}>{m.body}</p>
              {!!m.evidence_version_ids.length && (
                <p>References {m.evidence_version_ids.length} uploaded evidence file(s).</p>
              )}
            </article>
          ))
        ) : (
          <p>No messages yet. Add your side of the story.</p>
        )}
      </div>
      {c.status !== 'DECIDED' && (!staff || c.assigned_to === me.data?.id) && (
        <form
          className="draft-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = e.currentTarget;
            const d = new FormData(f);
            if (
              await cmd.send(
                `${path}/messages`,
                {
                  body: d.get('body'),
                  ...(staff ? { audienceId: target } : {}),
                  evidenceVersionIds: d.getAll('evidence'),
                },
                true,
              )
            )
              f.reset();
          }}
        >
          <label>
            Message
            <textarea name="body" required maxLength={4000} />
          </label>
          {staff &&
            c.evidence.map((v, i) => (
              <label key={v.id}>
                <input type="checkbox" name="evidence" value={v.id} /> Reference evidence {i + 1}
              </label>
            ))}
          <button className="button" disabled={cmd.busy}>
            Send to {staff ? 'selected party' : 'reviewer'}
          </button>
        </form>
      )}
      {staff && (
        <details className={styles.evidence}>
          <summary>Agreement and processed evidence</summary>
          <h4>{c.pact?.title}</h4>
          <p>{c.pact?.agreement}</p>
          {c.pact?.commitments.map((v, i) => (
            <article key={i}>
              <h4>{v.title}</h4>
              <p>{v.description}</p>
              <p>Acceptance: {v.acceptance_criteria}</p>
            </article>
          ))}
          {c.evidence.map((v, i) => (
            <article key={v.id}>
              <h4>Evidence {i + 1}</h4>
              <button
                className="text-link"
                disabled={c.assigned_to !== me.data?.id}
                onClick={async () => {
                  try {
                    const file = await api<{ url: string }>(`${path}/evidence/${v.id}/download`);
                    window.location.assign(file.url);
                  } catch (e) {
                    setDownloadError(
                      e instanceof Error
                        ? e.message
                        : 'Evidence could not be downloaded. Refresh and try again.',
                    );
                  }
                }}
              >
                Download original evidence
              </button>
              <pre>{v.content}</pre>
            </article>
          ))}
        </details>
      )}
      {c.decision ? (
        <div className="notice">
          <div>
            <h3>Reviewer decision</h3>
            <p>{c.decision.reason}</p>
            {c.decision.response_override_reason && (
              <p>Nonresponse review: {c.decision.response_override_reason}</p>
            )}
            <p>
              {c.decision.proposal.type === 'NO_ACTION'
                ? 'Review closed without a refund.'
                : 'Refund authorized. Check Financial records for verified PayPal completion; authorization is not a completed receipt.'}
            </p>
            <Link href={`/workspace/pacts/${c.pact_id}`}>Open shared payment record</Link>
          </div>
        </div>
      ) : (
        staff &&
        c.assigned_to === me.data?.id && (
          <form
            className="draft-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const type = d.get('type');
              await cmd.send(`${path}/decision`, {
                expectedVersion: c.version,
                expectedEvidenceVersionIds: c.evidence.map((e) => e.id).sort(),
                type,
                reason: d.get('reason'),
                ...(type === 'PARTIAL_REFUND' ? { percentage: Number(d.get('percentage')) } : {}),
                ...(d.get('override') ? { responseOverrideReason: d.get('override') } : {}),
              });
            }}
          >
            <h3>Record a human decision</h3>
            <p>
              Read both sides and evidence. Refresh before deciding. A selected refund is submitted
              without seller approval.
            </p>
            <label>
              Outcome
              <select name="type">
                <option value="NO_ACTION">Close review without refund</option>
                <option value="FULL_REFUND">Refund remaining captured payment</option>
                <option value="PARTIAL_REFUND">Partial refund</option>
              </select>
            </label>
            <label>
              Partial refund percentage
              <input name="percentage" type="number" min={1} max={99} />
            </label>
            <label>
              Reason shared with both parties
              <textarea name="reason" required minLength={20} maxLength={4000} />
            </label>
            <label>
              If a party did not respond after the deadline, explain
              <textarea name="override" maxLength={1000} />
            </label>
            <label>
              <input type="checkbox" required /> I reviewed both sides and understand the selected
              financial outcome.
            </label>
            <button className="button" disabled={cmd.busy}>
              Record decision and submit selected outcome
            </button>
          </form>
        )
      )}
      {cmd.feedback && <p role="status">{cmd.feedback}</p>}
    </section>
  );
}
export function StaffInbox() {
  return (
    <AccessGate>
      <Inbox />
    </AccessGate>
  );
}
function Inbox() {
  const settings = useResource<{ enabled: boolean }>('me/reviewer');
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <p className="eyebrow">Pact support</p>
      <h1>Human review desk</h1>
      <p>
        Sign in with your verified Pact account. Personal PayPal credentials are not needed. Another
        reviewer must handle Pacts you belong to.
      </p>
      {!settings.data ? (
        <ResourceState {...settings} retry={settings.reload} />
      ) : !settings.data.enabled ? (
        <p role="alert">This account is not an authorized reviewer.</p>
      ) : (
        <AuthorizedInbox selected={selected} select={setSelected} />
      )}
    </>
  );
}
function AuthorizedInbox({
  selected,
  select,
}: {
  selected: string | null;
  select: (id: string) => void;
}) {
  const cases = useResource<Case[]>('staff/cases');
  return (
    <>
      <button className="button secondary" onClick={cases.reload}>
        Refresh inbox
      </button>
      {cases.error && <p role="alert">{cases.error}</p>}
      <ul className={styles.caseList}>
        {cases.data?.map((c) => (
          <li key={c.id}>
            <button className="text-link" onClick={() => select(c.id)}>
              {c.title} · {c.kind} · {c.status}
            </button>
            <p>{c.reason}</p>
          </li>
        ))}
      </ul>
      {cases.data?.length === 0 && <p>No eligible cases awaiting review.</p>}
      {selected && <CaseConversation key={selected} caseId={selected} staff />}
    </>
  );
}

export function ReviewDeskLink() {
  const r = useResource<{ enabled: boolean }>('me/reviewer');
  return r.data?.enabled ? <Link href="/workspace/support">Review desk</Link> : null;
}
