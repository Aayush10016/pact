'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react';
import { createPactSchema } from '@pact/types';
import { AccessGate, useApi } from './session';
export function DraftForm() {
  return (
    <AccessGate>
      <PersistentForm />
    </AccessGate>
  );
}
function PersistentForm() {
  const api = useApi();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(1);
  const [key] = useState(() => crypto.randomUUID());
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const amount = String(f.get('amount'));
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setError('Enter a positive amount with up to two decimal places.');
      return;
    }
    const [whole = '0', fraction = ''] = amount.split('.');
    const minor = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
    const deadline = f.get('deadline') ? `${f.get('deadline')}T23:59:59.000Z` : null;
    const input = {
      title: f.get('title'),
      counterpartyEmail: f.get('otherParty'),
      agreement: f.get('agreement'),
      money: { amountMinor: minor, currency: f.get('currency') },
      deadline,
      paymentCondition: f.get('paymentCondition'),
      payerRole: f.get('payerRole'),
      commitments: Array.from({ length: count }, (_, i) => ({
        title: f.get(`title-${i}`),
        description: f.get(`description-${i}`),
        acceptanceCriteria: f.get(`criteria-${i}`),
        expectedEvidence: f.get(`evidence-${i}`),
        dueAt: deadline,
        milestones: f.get(`milestone-${i}`)
          ? [{ title: f.get(`milestone-${i}`), dueAt: deadline }]
          : [],
      })),
    };
    const parsed = createPactSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the agreement fields.');
      return;
    }
    setBusy(true);
    try {
      const pact = await api<{ id: string }>('pacts', {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify(parsed.data),
      });
      router.push(`/workspace/pacts/${pact.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pact could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="text-link breadcrumb" href="/workspace">
        <ArrowLeft size={16} />
        Your pacts
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">START WITH COMMON GROUND.</p>
          <h1>Make the commitment.</h1>
          <p className="muted">Define what you�re agreeing to, before the work begins.</p>
        </div>
      </div>
      <div className="form-layout">
        <form className="draft-form" onSubmit={submit}>
          <fieldset>
            <legend>01 / The agreement</legend>
            <label>
              Pact name
              <input
                name="title"
                required
                minLength={3}
                maxLength={120}
                placeholder="e.g. A new identity for Fieldwork"
              />
            </label>
            <label>
              Other party�s email
              <input
                name="otherParty"
                aria-label="Other party�s email"
                type="email"
                required
                aria-describedby="party-help"
              />
              <span id="party-help" className="field-help">
                They will see an invitation when they sign in with this verified email. No email is
                sent automatically.
              </span>
            </label>
            <label>
              What are you agreeing to?
              <textarea name="agreement" rows={4} required minLength={20} maxLength={4000} />
            </label>
          </fieldset>
          <fieldset>
            <legend>02 / Clear commitments</legend>
            {Array.from({ length: count }, (_, i) => (
              <div key={i}>
                <p className="eyebrow">COMMITMENT {i + 1} / YOUR PROMISE</p>
                <label>
                  Deliverable {i + 1}
                  <input name={`title-${i}`} required minLength={3} maxLength={120} />
                </label>
                <label>
                  Scope of commitment {i + 1}
                  <textarea name={`description-${i}`} required minLength={10} maxLength={4000} />
                </label>
                <label>
                  Acceptance criteria {i + 1}
                  <textarea name={`criteria-${i}`} required minLength={3} maxLength={2000} />
                </label>
                <label>
                  Expected evidence {i + 1}
                  <input name={`evidence-${i}`} required minLength={3} maxLength={1000} />
                </label>
                <label>
                  Milestone {i + 1} (optional)
                  <input name={`milestone-${i}`} minLength={3} maxLength={120} />
                </label>
              </div>
            ))}
            <button
              className="button secondary"
              type="button"
              disabled={count >= 20 || busy}
              onClick={() => setCount((c) => c + 1)}
            >
              Add another commitment
            </button>
            <label>
              Deadline (optional)
              <input name="deadline" type="date" />
            </label>
          </fieldset>
          <fieldset>
            <legend>03 / Payment conditions</legend>
            <div className="two-fields">
              <label>
                Agreed amount
                <input
                  name="amount"
                  inputMode="decimal"
                  maxLength={18}
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  required
                />
              </label>
              <label>
                Currency
                <select name="currency">
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>INR</option>
                </select>
              </label>
            </div>
            <label>
              Who will pay?
              <select name="payerRole">
                <option value="PARTY_A">I will pay</option>
                <option value="PARTY_B">The other party will pay</option>
              </select>
            </label>
            <label>
              When should payment be authorized?
              <textarea name="paymentCondition" rows={3} required minLength={10} maxLength={1000} />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Link href="/workspace" className="text-link">
              Cancel
            </Link>
            <button className="button" disabled={busy} type="submit">
              {busy ? 'Saving the agreement�' : 'Create Pact'}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
        <aside className="form-aside">
          <h2>
            A clear promise
            <br />
            is a better beginning.
          </h2>
          <p>
            Be specific about what will be delivered, when it�s due, and what both sides need to
            approve.
          </p>
          <div className="notice">
            <LockKeyhole size={20} />
            <p>
              Creating a Pact stores the agreement privately. Acceptance and PayPal Sandbox checkout
              are separate, deliberate actions.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
