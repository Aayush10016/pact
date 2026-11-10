'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ArrowRight, LockKeyhole } from 'lucide-react';
import { draftSchema } from '@pact/types';
export function DraftForm() {
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const amount = String(f.get('amount') ?? '');
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setError('Enter a positive amount with up to two decimal places.');
      return;
    }
    const [whole = '0', fraction = ''] = amount.split('.');
    const minor = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
    const parsed = draftSchema.safeParse({
      title: f.get('title'),
      otherParty: f.get('otherParty'),
      agreement: f.get('agreement'),
      money: { amountMinor: minor, currency: f.get('currency') },
      deadline: f.get('deadline'),
      deliverable: f.get('deliverable'),
      paymentCondition: f.get('paymentCondition'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form fields.');
      return;
    }
    const today = new Date();
    const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (parsed.data.deadline < localToday) {
      setError('Choose a deadline today or later.');
      return;
    }
    try {
      sessionStorage.setItem('pact-preview-draft', JSON.stringify(parsed.data));
      setError('');
      setSaved(true);
    } catch {
      setError('Your browser could not save this draft. Enable session storage and try again.');
    }
  }
  return (
    <>
      <Link className="text-link breadcrumb" href="/preview">
        <ArrowLeft size={16} />
        Your pacts
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">START WITH COMMON GROUND.</p>
          <h1>Make the commitment.</h1>
          <p className="muted">Define what you’re agreeing to, before the work begins.</p>
        </div>
      </div>
      {saved ? (
        <section className="draft-success" role="status">
          <span className="step-marker done">
            <Check size={20} />
          </span>
          <h2>Your preview draft is saved.</h2>
          <p>
            It’s saved in this browser tab’s session. No invitation was sent, no account was
            created, and no payment was initiated.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/preview">
              Back to the workspace <ArrowRight size={16} />
            </Link>
            <button className="button secondary" onClick={() => setSaved(false)}>
              Edit a new draft
            </button>
          </div>
        </section>
      ) : (
        <div className="form-layout">
          <form className="draft-form" onSubmit={submit}>
            <fieldset>
              <legend>01 / The agreement</legend>
              <label>
                Pact name
                <input
                  name="title"
                  placeholder="e.g. A new identity for Fieldwork"
                  required
                  minLength={3}
                  maxLength={120}
                />
              </label>
              <label>
                Other party’s email
                <input
                  name="otherParty"
                  aria-label="Other party’s email"
                  aria-describedby="party-help"
                  type="email"
                  placeholder="name@example.com"
                  required
                />
                <span id="party-help" className="field-help">
                  For this draft only. We won’t send an invitation.
                </span>
              </label>
              <label>
                What are you agreeing to?
                <textarea
                  name="agreement"
                  rows={4}
                  placeholder="Describe the scope, quality expectations, and what completion means."
                  required
                  minLength={20}
                  maxLength={4000}
                />
              </label>
            </fieldset>
            <fieldset>
              <legend>02 / A measurable milestone</legend>
              <label>
                Deliverable
                <input
                  name="deliverable"
                  placeholder="e.g. Final logo assets and brand guidelines"
                  required
                  minLength={3}
                  maxLength={500}
                />
              </label>
              <label>
                Deadline
                <input name="deadline" type="date" required />
              </label>
              <p className="field-help">
                This foundation captures one initial milestone. Additional milestones come in Phase
                2.
              </p>
            </fieldset>
            <fieldset>
              <legend>03 / Payment conditions</legend>
              <div className="two-fields">
                <label>
                  Agreed amount
                  <input
                    name="amount"
                    maxLength={18}
                    inputMode="decimal"
                    placeholder="2400.00"
                    required
                    pattern="[0-9]+(\.[0-9]{1,2})?"
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
                When should payment be authorized?
                <textarea
                  name="paymentCondition"
                  rows={3}
                  placeholder="e.g. After both parties approve the final deliverables."
                  required
                  minLength={10}
                  maxLength={1000}
                />
              </label>
            </fieldset>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Link href="/preview" className="text-link">
                Cancel
              </Link>
              <button className="button" type="submit">
                Save preview draft <ArrowRight size={16} />
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
              Be specific about what will be delivered, when it’s due, and what both sides need to
              approve.
            </p>
            <div className="notice">
              <LockKeyhole size={20} />
              <p>
                This is a local preview. Live agreements, accounts, and PayPal are not connected.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
