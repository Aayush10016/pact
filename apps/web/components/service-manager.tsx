'use client';
import { useState } from 'react';
import Link from 'next/link';
import { serviceWriteSchema, type ServiceListing } from '@pact/types';
import { AccessGate, ResourceState, useApi, useResource } from './session';
export function ServiceManager() {
  return (
    <AccessGate>
      <Manager />
    </AccessGate>
  );
}
function Manager() {
  const resource = useResource<ServiceListing[]>('services');
  const api = useApi();
  const [editing, setEditing] = useState<ServiceListing | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  function edit(s: ServiceListing | null) {
    setEditing(s);
    setRevision((r) => r + 1);
    setRequestId(crypto.randomUUID());
    setMessage('');
    setError('');
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = String(form.get('price'));
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setError('Enter a positive price with up to two decimal places.');
      return;
    }
    const [whole = '0', part = ''] = amount.split('.');
    const result = serviceWriteSchema.safeParse({
      requestId,
      expectedVersion: editing?.version ?? 0,
      title: form.get('title'),
      description: form.get('description'),
      category: form.get('category'),
      acceptanceCriteria: form.get('criteria'),
      expectedEvidence: form.get('evidence'),
      amountMinor: (BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'))).toString(),
      currency: form.get('currency'),
      deliveryDays: Number(form.get('days')),
      published: form.get('published') === 'on',
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Check the service fields.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(editing ? `services/${editing.id}` : 'services', {
        method: 'POST',
        body: JSON.stringify(result.data),
      });
      edit(null);
      setMessage(
        result.data.published
          ? 'Your service is published. New requests create a Pact for you to review.'
          : 'Your service is saved as a private draft.',
      );
      await resource.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Service could not be saved. Refresh before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORK, CLEARLY DEFINED.</p>
          <h1>Your services.</h1>
          <p className="muted">The same account can offer services and buy from other members.</p>
        </div>
        <Link href="/workspace/account" className="button secondary">
          Your PayPal connection
        </Link>
      </div>
      <ResourceState {...resource} retry={resource.reload} />
      {message && <p role="status">{message}</p>}
      <div className="market-detail">
        <section>
          <h2>{editing ? 'Edit service' : 'Offer a service'}</h2>
          <p className="muted">
            Be specific about the outcome and the evidence you will deliver. Changes apply to future
            requests; existing agreements keep their accepted terms.
          </p>
          <form key={revision} className="draft-form market-form" onSubmit={save}>
            <label>
              Service name
              <input
                name="title"
                required
                minLength={3}
                maxLength={120}
                defaultValue={editing?.title}
              />
            </label>
            <label>
              Category
              <select name="category" defaultValue={editing?.category ?? 'Development'}>
                {['Development', 'Design', 'Writing', 'Consulting', 'Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              What will you deliver?
              <textarea
                name="description"
                required
                minLength={20}
                maxLength={4000}
                rows={5}
                defaultValue={editing?.description}
              />
            </label>
            <label>
              How will the buyer know it is complete?
              <textarea
                name="criteria"
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                defaultValue={editing?.acceptance_criteria}
              />
            </label>
            <label>
              What evidence will you provide?
              <textarea
                name="evidence"
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                defaultValue={editing?.expected_evidence}
              />
            </label>
            <div className="market-form-row">
              <label>
                Price
                <input
                  name="price"
                  type="number"
                  min="1"
                  max="1000000"
                  step="0.01"
                  required
                  defaultValue={editing ? Number(editing.amount_minor) / 100 : undefined}
                />
              </label>
              <label>
                Currency
                <select name="currency" defaultValue={editing?.currency ?? 'USD'}>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </label>
              <label>
                Delivery days
                <input
                  name="days"
                  type="number"
                  min="1"
                  max="365"
                  required
                  defaultValue={editing?.delivery_days ?? 7}
                />
              </label>
            </div>
            <label className="checkbox-row">
              <input
                name="published"
                type="checkbox"
                defaultChecked={editing?.published ?? false}
              />{' '}
              Publish this service in the marketplace
            </label>
            <p className="field-help">
              Drafts stay private. Publishing shows your name, terms, price and verified agreement
              reviews. PayPal verification is required before receiving payments.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="market-actions">
              <button className="button" disabled={busy}>
                {busy ? 'Saving…' : 'Save service'}
              </button>
              {editing && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => edit(null)}
                >
                  Cancel editing
                </button>
              )}
            </div>
          </form>
        </section>
        <aside>
          <h2>Your listings</h2>
          {resource.data?.length === 0 && <p>No services yet. Your first draft starts here.</p>}
          {resource.data?.map((s) => (
            <article className="market-listing" key={s.id}>
              <p className="eyebrow">{s.published ? 'PUBLISHED' : 'PRIVATE DRAFT'}</p>
              <h3>{s.title}</h3>
              <p>
                {s.currency} {(Number(s.amount_minor) / 100).toFixed(2)} · {s.delivery_days} days
              </p>
              <div className="market-actions">
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => edit(s)}
                >
                  Edit or unpublish
                </button>
                {s.published && (
                  <Link className="text-link" href={`/marketplace/${s.id}`}>
                    View service
                  </Link>
                )}
              </div>
            </article>
          ))}
        </aside>
      </div>
    </>
  );
}
