'use client';
import Link from 'next/link';
import styles from './record-panels.module.css';
import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Clock3, FileText, LockKeyhole } from 'lucide-react';
import { groundedAssessmentSchema, type PactRecord } from '@pact/types';
import { formatMoney } from '@pact/shared';
import { AccessGate, ApiError, useApi, useResource, ResourceState } from './session';
import { FinancialRecords } from './financial-receipt';
const sections = ['Commitments', 'Evidence', 'Assessment', 'Resolution'] as const;
type Capabilities = { storage: boolean; advisory: boolean; paypal: boolean; workers: boolean };
export function PactDetail({ id }: { id: string }) {
  return (
    <AccessGate>
      <PrivateDetail id={id} />
    </AccessGate>
  );
}
function PrivateDetail({ id }: { id: string }) {
  const record = useResource<PactRecord>(`pacts/${id}`);
  const reload = record.reload;
  const me = useResource<{ id: string }>('me');
  const capabilities = useResource<Capabilities>('capabilities');
  const api = useApi();
  const [section, setSection] = useState<(typeof sections)[number]>('Commitments');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [checkoutUnavailable, setCheckoutUnavailable] = useState(false);
  const actionPending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [operation, setOperation] = useState<{
    id: string;
    status: string;
    response?: { approvalUrl?: string };
  } | null>(null);
  const p = record.data;
  const waiting =
    !!p &&
    (p.evidence.some((e) => e.versions.at(-1)?.state === 'PENDING') ||
      p.analyses.some((a) => a.state === 'PENDING') ||
      (p.transaction.confirmation_pending ?? false));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [waiting, reload]);
  useEffect(() => {
    if (
      !p?.transaction.confirmation_pending ||
      !['CREATED', 'AUTHORIZED', 'CAPTURED'].includes(p.transaction.state)
    )
      return;
    let active = true;
    let checking = false;
    let attempts = 0;
    const timer = setInterval(() => {
      if (checking || attempts >= 6) return;
      checking = true;
      attempts++;
      void api(`pacts/${id}/payment/refresh`, { method: 'POST', body: '{}' })
        .then(() => {
          if (active) reload();
        })
        .catch(() => {
          if (active)
            setError(
              'Automatic payment confirmation could not finish. Use Refresh record to retry without charging again.',
            );
          attempts = 6;
        })
        .finally(() => {
          checking = false;
        });
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, id, p?.transaction.confirmation_pending, p?.transaction.state, reload]);
  useEffect(() => {
    if (
      !operation ||
      ['CONFIRMED', 'FAILED', 'CANCELLED', 'NEEDS_RECONCILIATION'].includes(operation.status)
    )
      return;
    let active = true;
    const timer = setInterval(
      () =>
        void api<typeof operation>(`pacts/${id}/payment/operations/${operation.id}`)
          .then((value) => {
            if (active) {
              setOperation(value);
              reload();
            }
          })
          .catch(() => {
            if (active) setError('Payment status could not refresh. Use Refresh record to retry.');
          }),
      5000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, id, operation, reload]);
  async function action(path: string, value: unknown = {}, label = 'Record saved.') {
    if (actionPending.current) return null;
    actionPending.current = true;
    setBusy(path);
    setError('');
    setSuccess('');
    try {
      const result = await api<{ id: string; status: string }>(`pacts/${id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(value),
      });
      setSuccess(label);
      reload();
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.reason === 'PAYPAL_ORDER_UNAVAILABLE') {
        setCheckoutUnavailable(true);
        setOperation(null);
      }
      setError(e instanceof Error ? e.message : 'Action could not be completed.');
      return null;
    } finally {
      actionPending.current = false;
      setBusy('');
    }
  }
  async function payment(kind: 'order' | 'capture') {
    const result = await action(
      `payment/${kind}`,
      {},
      'Payment request queued. Confirmation comes from verified PayPal events.',
    );
    if (result) {
      setCheckoutUnavailable(false);
      setOperation(result);
      if (result.status !== 'QUEUED')
        setSuccess(
          'Existing payment operation returned. Its status is shown below. No new payment request was created.',
        );
    }
  }
  async function refreshRecord() {
    setRefreshing(true);
    setError('');
    setSuccess('');
    try {
      if (
        p?.transaction.confirmation_pending &&
        ['CREATED', 'AUTHORIZED', 'CAPTURED'].includes(p.transaction.state)
      )
        await api(`pacts/${id}/payment/refresh`, { method: 'POST', body: '{}' });
      const [loaded, configured] = await Promise.all([record.refresh(), capabilities.refresh()]);
      if (operation)
        setOperation(await api<typeof operation>(`pacts/${id}/payment/operations/${operation.id}`));
      if (!loaded || !configured) throw new Error('The record could not refresh. Try again.');
      setSuccess(
        'Record refreshed from the server. Payment changes require verified PayPal confirmation.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The record could not refresh.');
    } finally {
      setRefreshing(false);
    }
  }
  async function download(vid: string) {
    setError('');
    try {
      const result = await api<{ url: string }>(`pacts/${id}/evidence/versions/${vid}/download`);
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download unavailable.');
    }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const file = f.get('file');
    if (!(file instanceof File) || file.size > 8 * 1024 * 1024) {
      setError('Choose a supported file up to 8 MiB.');
      return;
    }
    const eid = String(f.get('existing') || '');
    const input = {
      title: f.get('title'),
      commitmentId: f.get('commitment'),
      occurredAt: new Date().toISOString(),
      requestId: crypto.randomUUID(),
    };
    const body = new FormData();
    body.set('metadata', JSON.stringify(input));
    body.set('file', file);
    setBusy('upload');
    setError('');
    try {
      await api(`pacts/${id}/evidence${eid ? `/${eid}/versions` : ''}`, { method: 'POST', body });
      setSuccess('Evidence stored privately. Processing has been queued.');
      form.reset();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evidence could not be stored.');
    } finally {
      setBusy('');
    }
  }
  async function propose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const type = String(f.get('type'));
    const result = await action(
      'resolutions',
      {
        type,
        ...(type === 'PARTIAL_REFUND' ? { percentage: Number(f.get('percentage')) } : {}),
        reason: f.get('reason'),
        expectedVersion: p?.resolutions[0]?.version ?? 0,
        ...(f.get('analysis') ? { analysisId: f.get('analysis') } : {}),
      },
      'A new version is ready for both parties to review. Previous approvals cannot authorize it.',
    );
    return result;
  }
  if ((record.loading && !p) || record.error || !p)
    return <ResourceState loading={record.loading} error={record.error} retry={record.reload} />;
  const current = p.resolutions.find((r) => !r.retired_at);
  const assessment = groundedAssessmentSchema.safeParse(
    p.analyses.find((a) => a.state === 'READY')?.assessment,
  );
  const party = p.parties.find((r) => r.user_id === me.data?.id);
  const isPayer = party?.role === p.transaction.payer_role;
  const resolutionRequest = p.audit.find((a) =>
    ['PACT_DISPUTED', 'PACT_RESOLUTION_CONCERN'].includes(a.event_type),
  );
  const approval = current?.approvals.find((a) => a.user_id === me.data?.id);
  const approved =
    current?.approvals.length === 2 && current.approvals.every((a) => a.decision === 'APPROVED');
  const consequence = current
    ? current.proposal.type === 'NO_ACTION'
      ? 'keep the captured payment'
      : `refund ${formatMoney({ amountMinor: current.proposal.amountMinor, currency: current.proposal.currency })}${current.proposal.percentage ? ` (${current.proposal.percentage}%)` : ''}`
    : '';
  return (
    <>
      <Link href="/workspace" className="text-link breadcrumb">
        <ArrowLeft size={16} />
        Your pacts
      </Link>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">PACT / PRIVATE SHARED RECORD</p>
          <h1>{p.title}</h1>
          <div className="parties">
            {p.parties.map((r, i) => (
              <span key={r.user_id}>
                <span className={`avatar ${i ? 'clay' : ''}`}>
                  {r.display_name.slice(0, 2).toUpperCase()}
                </span>{' '}
                {r.display_name} · Party {i ? 'B' : 'A'}
              </span>
            ))}
            {p.parties.length === 1 && <span>Counterparty acceptance pending</span>}
          </div>
        </div>
        <div>
          <span className={`badge ${p.status === 'DISPUTED' ? 'warning' : ''}`}>
            {p.status === 'DISPUTED' ? 'Resolution requested' : p.status.toLowerCase()}
          </span>
          <p className="mono detail-money">
            {formatMoney({
              amountMinor: p.transaction.amount_minor,
              currency: p.transaction.currency,
            })}
          </p>
          <p className="muted">
            {p.transaction.state === 'COMPLETED' && BigInt(p.transaction.refunded_minor ?? '0') > 0n
              ? 'Payment captured · Refund completed'
              : `Payment: ${p.transaction.state.toLowerCase()}`}{' '}
            · {p.transaction.currency}
          </p>
        </div>
      </div>
      <div className="section-toolbar">
        <span className="mono">RECORD VERSION {p.version}</span>
        <button className="text-link" disabled={refreshing} onClick={() => void refreshRecord()}>
          {refreshing ? 'Refreshing record…' : 'Refresh record'}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
      {checkoutUnavailable && (
        <div className="notice" role="status">
          <div>
            <p>
              Keep this record for its history. If you changed merchant apps and have verified that
              the old checkout has no completed payment, create a new Pact, have both parties accept
              it, then create its Sandbox checkout. Approval at PayPal is separate from capture.
            </p>
            <Link className="button secondary" href="/workspace/new">
              Create a new Pact for the current Sandbox app
            </Link>
          </div>
        </div>
      )}
      <div className="detail-layout">
        <div>
          <nav className="detail-tabs" aria-label="Pact sections">
            {sections.map((s) => (
              <button
                key={s}
                aria-current={s === section ? 'page' : undefined}
                onClick={() => setSection(s)}
              >
                {s}
              </button>
            ))}
          </nav>
          <section
            className={`detail-content ${section === 'Assessment' || section === 'Resolution' ? styles.results : ''}`}
          >
            {section === 'Commitments' && (
              <>
                <p className="eyebrow">WHAT WAS PROMISED</p>
                <h2>A shared definition of done.</h2>
                <p className="muted">{p.agreement}</p>
                <div className="commitment-list">
                  {p.commitments.map((c, i) => (
                    <article key={c.id}>
                      <span className="step-marker">{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <h3>{c.title}</h3>
                        <p>{c.description}</p>
                        <p>Acceptance: {c.acceptance_criteria}</p>
                        <p>Expected evidence: {c.expected_evidence}</p>
                        <p className="mono">Fulfillment: {c.status.toLowerCase()}</p>
                        {c.milestones.map((m) => (
                          <div key={m.id}>
                            <p>
                              {m.title} · {m.status.toLowerCase()}
                            </p>
                            {c.promised_by === me.data?.id &&
                              m.status === 'PENDING' &&
                              p.status === 'ACTIVE' && (
                                <button
                                  className="button secondary small"
                                  disabled={!!busy}
                                  onClick={() =>
                                    action(
                                      `milestones/${m.id}/deliver`,
                                      {},
                                      'Delivery recorded. This does not establish fulfillment or authorize money.',
                                    )
                                  }
                                >
                                  Record milestone delivery
                                </button>
                              )}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <h2>Payment follows authorization.</h2>
                <p>{p.payment_condition}</p>
                <FinancialRecords
                  key={`${p.version}-${p.transaction.state}-${p.transaction.refunded_minor}`}
                  pactId={id}
                />
                <div className="notice">
                  <LockKeyhole size={19} />
                  <p>
                    Sandbox only. Checkout pays the configured developer merchant account; Pact is
                    not escrow. Payment and fulfillment are separate records.
                  </p>
                </div>
                {capabilities.error && <p role="alert">{capabilities.error}</p>}
                {!capabilities.data?.paypal || !capabilities.data.workers ? (
                  <p className="muted">
                    PayPal Sandbox or background processing is not configured.
                  </p>
                ) : isPayer &&
                  p.status === 'ACTIVE' &&
                  ['CREATED', 'AUTHORIZED'].includes(p.transaction.state) ? (
                  <div className="hero-actions">
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => payment('order')}
                    >
                      {checkoutUnavailable
                        ? 'Check existing checkout again'
                        : 'Create Sandbox checkout'}
                    </button>
                    <button
                      className="button secondary"
                      disabled={!!busy || checkoutUnavailable}
                      onClick={() => payment('capture')}
                    >
                      Capture approved Sandbox payment
                    </button>
                  </div>
                ) : (
                  <p className="muted">
                    {!['CREATED', 'AUTHORIZED', 'CAPTURED'].includes(p.transaction.state) ||
                    p.status !== 'ACTIVE'
                      ? p.transaction.confirmation_pending
                        ? 'Payment was submitted. Use Refresh record to verify the PayPal result without charging again.'
                        : p.status === 'DISPUTED' &&
                            ['CREATED', 'AUTHORIZED'].includes(p.transaction.state)
                          ? 'Resolution requested. Payment is not confirmed; review the next steps in Resolution.'
                          : 'Payment actions are closed. View confirmed results in Financial records.'
                      : 'Only the Pact’s payer can initiate or capture checkout.'}
                  </p>
                )}
                {operation && (
                  <div className="notice">
                    <div>
                      <p>Operation: {operation.status.toLowerCase().replaceAll('_', ' ')}</p>
                      {operation.response?.approvalUrl && (
                        <a
                          className="button secondary"
                          href={operation.response.approvalUrl}
                          rel="noopener noreferrer"
                        >
                          Review and authorize at PayPal Sandbox
                        </a>
                      )}
                      <p>
                        Provider acceptance is not final payment confirmation. Verified webhooks
                        update the record.
                      </p>
                    </div>
                  </div>
                )}
                {p.status === 'ACTIVE' && (
                  <button className="button secondary" onClick={() => setSection('Resolution')}>
                    Review resolution options
                  </button>
                )}
              </>
            )}
            {section === 'Evidence' && (
              <>
                <p className="eyebrow">WHAT HAPPENED</p>
                <h2>A record that stays connected.</h2>
                <p className="muted">
                  Private, immutable versions. Documents and party statements remain untrusted
                  evidence.
                </p>
                <div className="evidence-list">
                  {p.evidence.map((e) => (
                    <article key={e.id}>
                      <FileText size={23} />
                      <div>
                        <h3>{e.title}</h3>
                        {e.versions.map((v) => (
                          <div key={v.id}>
                            <p className="mono">
                              Version {v.version} · {v.state.toLowerCase()} · {v.mime_type}
                            </p>
                            {v.state === 'FAILED' && (
                              <p>
                                Text extraction is unavailable. Document downloads require
                                successful safety checks. Images remain available for human review;
                                upload text evidence to support assessment.
                              </p>
                            )}
                            <button className="text-link" onClick={() => download(v.id)}>
                              Download version {v.version}
                            </button>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                {!p.evidence.length && (
                  <div className="empty-state">
                    <h3>No evidence yet.</h3>
                    <p>Add a dated record linked to a commitment.</p>
                  </div>
                )}
                {capabilities.data?.storage &&
                capabilities.data.workers &&
                ['ACTIVE', 'DISPUTED'].includes(p.status) ? (
                  <form className="draft-form" onSubmit={upload}>
                    <fieldset>
                      <legend>Add a private record</legend>
                      <label>
                        Evidence title
                        <input name="title" required minLength={3} maxLength={120} />
                      </label>
                      <label>
                        Supports commitment
                        <select name="commitment">
                          {p.commitments.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Version history
                        <select name="existing">
                          <option value="">Create new evidence</option>
                          {p.evidence
                            .filter((e) => e.uploaded_by === me.data?.id)
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                New version of {e.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Evidence file
                        <input
                          type="file"
                          name="file"
                          required
                          accept=".txt,.png,.jpg,.jpeg,.pdf,.docx"
                        />
                        <span className="field-help">
                          Up to 8 MiB. Text, PDF, and DOCX text can be extracted; screenshots/images
                          remain human-reviewed. URL ingestion is disabled.
                        </span>
                      </label>
                    </fieldset>
                    <button className="button secondary" disabled={!!busy}>
                      {busy === 'upload' ? 'Storing evidence…' : 'Store private evidence'}
                    </button>
                  </form>
                ) : (
                  <div className="notice">
                    <p>
                      Private storage or processing is unavailable, or this Pact is closed. Evidence
                      upload remains disabled.
                    </p>
                  </div>
                )}
              </>
            )}
            {section === 'Assessment' && (
              <>
                <p className="eyebrow">WHAT THE EVIDENCE SHOWS</p>
                <h2>An advisor. A clearer picture.</h2>
                {p.analyses[0]?.state === 'PENDING' && (
                  <p role="status">Assessment queued. The page will refresh while it processes.</p>
                )}
                {p.analyses[0]?.state === 'FAILED' && (
                  <p role="alert">
                    Assessment unavailable. Your Pact and evidence remain accessible. You can
                    explicitly request another assessment.
                  </p>
                )}
                {assessment.success && p.analyses[0]?.state !== 'READY' && (
                  <p className="notice">
                    Showing the earlier completed assessment while the latest request is unavailable
                    or processing.
                  </p>
                )}
                {assessment.success ? (
                  <>
                    <p className="badge">
                      {assessment.data.status.toLowerCase().replaceAll('_', ' ')}
                    </p>
                    <p>{assessment.data.reasoningSummary}</p>
                    <p className="mono">
                      Confidence in this assessment: {Math.round(assessment.data.confidence * 100)}%
                    </p>
                    <p className="muted">
                      This is model confidence, not the percentage of work completed.
                    </p>
                    {assessment.data.commitments.map((c) => (
                      <article className={styles.card} key={c.commitmentId}>
                        <h3>{p.commitments.find((v) => v.id === c.commitmentId)?.title}</h3>
                        {c.deliverableMatch !== undefined && (
                          <p>
                            <strong>Deliverable match estimate: {c.deliverableMatch}%</strong>
                            <br />
                            Advisory fit to the requested deliverable, not a measured completion
                            percentage. Review the cited support below.
                          </p>
                        )}
                        {c.claim && (
                          <p>
                            <strong>Observed evidence</strong>
                            <br />
                            {c.claim}
                          </p>
                        )}
                        <p>
                          <strong>Assessment</strong>
                          <br />
                          {c.inference}
                        </p>
                        {c.uncertainty && (
                          <p>
                            <strong>Limitations</strong>
                            <br />
                            {c.uncertainty}
                          </p>
                        )}
                        <p>Appears: {c.status.toLowerCase().replaceAll('_', ' ')}</p>
                        {c.evidenceIds.map((vid) => (
                          <button key={vid} className="text-link" onClick={() => download(vid)}>
                            Review{' '}
                            {p.evidence.find((e) => e.versions.some((v) => v.id === vid))?.title ??
                              'supporting document'}
                          </button>
                        ))}
                      </article>
                    ))}
                    <h3>Missing evidence</h3>
                    {assessment.data.missingEvidence.length ? (
                      <ul>
                        {assessment.data.missingEvidence.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        No additional gaps reported by the model. Review this judgment critically.
                      </p>
                    )}
                    {assessment.data.status === 'UNCLEAR' &&
                      !assessment.data.missingEvidence.length && (
                        <p>
                          Review the stated uncertainty together and clarify the acceptance
                          criteria. An unclear agreement criterion does not mean the uploaded
                          artifact is missing.
                        </p>
                      )}
                    <p>
                      Advisory recommendation:{' '}
                      {assessment.data.recommendation.type.toLowerCase().replaceAll('_', ' ')}
                      {assessment.data.recommendation.percentage
                        ? ` (${assessment.data.recommendation.percentage}%)`
                        : ''}
                    </p>
                  </>
                ) : (
                  <div className="assessment-empty">
                    <h3>No validated assessment available.</h3>
                    <p>
                      Assessment cites exact evidence versions and distinguishes claims from
                      observed support. AI has no financial authority.
                    </p>
                  </div>
                )}
                <button
                  className="button secondary"
                  disabled={
                    !!busy ||
                    !capabilities.data?.advisory ||
                    !capabilities.data.workers ||
                    p.analyses.some((a) => a.state === 'PENDING')
                  }
                  onClick={() =>
                    action(
                      'assessments',
                      { requestId: crypto.randomUUID() },
                      'Advisory assessment queued; no financial action was authorized.',
                    )
                  }
                >
                  Request advisory assessment
                </button>
                {!capabilities.data?.advisory && (
                  <p className="field-help">NVIDIA NIM is unavailable or not configured.</p>
                )}
              </>
            )}
            {section === 'Resolution' && (
              <>
                <p className="eyebrow">A FAIR OUTCOME</p>
                <h2>Both sides get a voice.</h2>
                <p>
                  A resolution request records a concern for both parties. It does not open a PayPal
                  dispute, reverse a payment, or let AI decide the outcome. Evidence and assessment
                  remain available.
                </p>
                {p.status === 'DISPUTED' && (
                  <div className="notice">
                    <div>
                      <h3>Why resolution was requested</h3>
                      {resolutionRequest && (
                        <p className="field-help">
                          Recorded by {resolutionRequest.actorName ?? 'a Pact member'} on{' '}
                          {new Date(resolutionRequest.created_at).toLocaleString()}. A member
                          requested review; this is not an automatic AI judgment or a PayPal
                          dispute.
                        </p>
                      )}
                      <p>
                        {p.audit.find(
                          (a) =>
                            ['PACT_DISPUTED', 'PACT_RESOLUTION_CONCERN'].includes(a.event_type) &&
                            a.reason,
                        )?.reason ??
                          'The earlier request did not record a reason. Either party can explain the concern below.'}
                      </p>
                      <p>
                        Review the evidence together. Either party can propose keeping the payment
                        or a refund. Both must approve the same outcome before it can be confirmed.
                        A rejection keeps the discussion open; a revised proposal needs fresh
                        decisions.
                      </p>
                    </div>
                  </div>
                )}
                {['ACTIVE', 'DISPUTED'].includes(p.status) && (
                  <form
                    className="draft-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const reason = new FormData(form).get('reason');
                      const result = await action(
                        'transition',
                        { status: 'DISPUTED', expectedVersion: p.version, reason },
                        'Concern shared with both parties. Review or propose an outcome below.',
                      );
                      if (result) form.reset();
                    }}
                  >
                    <label>
                      {p.status === 'DISPUTED'
                        ? 'Add context for both parties'
                        : 'What needs resolution?'}
                      <textarea
                        name="reason"
                        required
                        minLength={10}
                        maxLength={2000}
                        placeholder="Explain the concern and the outcome you would like."
                      />
                    </label>
                    <button className="button secondary" disabled={!!busy}>
                      {p.status === 'DISPUTED' ? 'Share resolution concern' : 'Request resolution'}
                    </button>
                  </form>
                )}
                {current ? (
                  <>
                    <p className="mono">Resolution version {current.version}</p>
                    <h3>Proposed consequence: {consequence}</h3>
                    <p>{current.proposal.reason}</p>
                    <p>
                      Exactly this version and financial amount are recorded in each decision. Both
                      parties must agree; AI cannot approve.
                    </p>
                    <div className="positions">
                      {p.parties.map((r) => (
                        <article key={r.user_id}>
                          <span className="mini-label">{r.role.replace('_', ' ')}</span>
                          <h3>{r.display_name}</h3>
                          <p>
                            {current.approvals
                              .find((a) => a.user_id === r.user_id)
                              ?.decision.toLowerCase() || 'No decision recorded'}
                          </p>
                        </article>
                      ))}
                    </div>
                    {!approval ? (
                      <div className="hero-actions">
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            action(
                              `resolutions/${current.id}/decision`,
                              {
                                decision: 'APPROVED',
                                version: current.version,
                                proposalSha256: current.proposal.proposalSha256,
                              },
                              'Approval recorded for this exact resolution version.',
                            )
                          }
                        >
                          Approve {consequence}
                        </button>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            action(
                              `resolutions/${current.id}/decision`,
                              {
                                decision: 'REJECTED',
                                version: current.version,
                                proposalSha256: current.proposal.proposalSha256,
                              },
                              'Rejection recorded. This version cannot execute.',
                            )
                          }
                        >
                          Reject this resolution
                        </button>
                      </div>
                    ) : (
                      <p className="notice">
                        Your {approval.decision.toLowerCase()} decision is recorded. A changed
                        proposal requires fresh decisions.
                      </p>
                    )}
                    {approved && (
                      <button
                        className="button secondary"
                        disabled={
                          !!busy ||
                          !!current.execution ||
                          p.status === 'COMPLETED' ||
                          p.status === 'RESOLVED' ||
                          (current.proposal.type !== 'NO_ACTION' &&
                            (!capabilities.data?.paypal || !capabilities.data.workers))
                        }
                        onClick={() =>
                          action(
                            `resolutions/${current.id}/execute`,
                            {},
                            'Authorized action submitted. Await verified provider confirmation.',
                          )
                        }
                      >
                        {current.proposal.type === 'NO_ACTION'
                          ? 'Confirm the agreed outcome'
                          : `Submit approved ${consequence}`}
                      </button>
                    )}
                    {current.execution && (
                      <p role="status">
                        Execution: {current.execution.status.toLowerCase().replaceAll('_', ' ')}.
                        Refresh the record for provider confirmation.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="notice">
                    <LockKeyhole size={20} />
                    <p>
                      {p.transaction.state === 'CAPTURED'
                        ? 'Either party can propose an outcome below. Both parties must approve the same proposal before it can take effect.'
                        : 'Payment confirmation is pending. Use Refresh record to check PayPal without charging again. Once the capture is confirmed, either party can propose keeping the payment or a refund.'}
                    </p>
                  </div>
                )}
                {p.resolutions.some((r) => r.retired_at) && (
                  <p className="field-help">
                    Earlier resolution versions were retired. Their approvals cannot authorize the
                    current proposal.
                  </p>
                )}
                {p.transaction.state === 'CAPTURED' &&
                  ['ACTIVE', 'DISPUTED'].includes(p.status) && (
                    <form className="draft-form" onSubmit={propose}>
                      <fieldset>
                        <legend>Propose a clear outcome</legend>
                        <label>
                          Financial consequence
                          <select name="type" required defaultValue="">
                            <option value="" disabled>
                              Choose a consequence
                            </option>
                            <option value="NO_ACTION">Keep the captured payment</option>
                            <option value="PARTIAL_REFUND">Partial refund</option>
                            <option value="FULL_REFUND">Full refund</option>
                          </select>
                        </label>
                        <label>
                          Partial refund percentage
                          <input name="percentage" type="number" min={1} max={99} />
                          <span className="field-help">
                            Required only for a partial refund. Amounts are calculated in integer
                            minor units.
                          </span>
                        </label>
                        <label>
                          Reason and supporting evidence
                          <textarea name="reason" required minLength={10} maxLength={2000} />
                        </label>
                        <label>
                          Assessment reference (optional)
                          <select name="analysis">
                            <option value="">Human proposal without AI assessment</option>
                            {p.analyses
                              .filter((a) => a.state === 'READY')
                              .map((a) => (
                                <option value={a.id} key={a.id}>
                                  Assessment {a.id.slice(0, 8)}
                                </option>
                              ))}
                          </select>
                        </label>
                      </fieldset>
                      <button className="button secondary" disabled={!!busy}>
                        Propose a new resolution version
                      </button>
                    </form>
                  )}
              </>
            )}
          </section>
        </div>
        <aside className="record-aside">
          <p className="eyebrow">THE SHARED RECORD</p>
          <h2>
            From promise
            <br />
            to outcome.
          </h2>
          <ol className="record-timeline">
            {p.audit.slice(0, 10).map((a) => (
              <li key={a.id}>
                <span className="timeline-dot done" />
                <div>
                  <strong>{a.label ?? a.event_type.replaceAll('_', ' ').toLowerCase()}</strong>
                  <p>{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="aside-footer">
            <Clock3 size={16} />
            <p>
              Persisted, append-only audit history. Payment changes require verified provider
              events.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
