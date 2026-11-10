'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ServiceListing } from '@pact/types';
import { useApi, useSession } from './session';
function Price({ service }: { service: ServiceListing }) {
  return (
    <span className="mono market-amount">
      {new Intl.NumberFormat('en', { style: 'currency', currency: service.currency }).format(
        Number(service.amount_minor) / 100,
      )}
    </span>
  );
}
function useCatalogue<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loadedPath, setLoadedPath] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/pact/${path}`, {
      cache: 'no-store',
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]),
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message ?? 'Services could not be loaded.');
        return json.data as T;
      })
      .then((value) => {
        if (abort.signal.aborted) return;
        setData(value);
        setError('');
        setLoadedPath(path);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Services could not be loaded.');
          setLoadedPath(path);
        }
      });
    return () => abort.abort();
  }, [path, revision]);
  return {
    data: loadedPath === path ? data : null,
    error: loadedPath === path ? error : '',
    retry: () => setRevision((r) => r + 1),
  };
}
export function Marketplace() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const path = `marketplace?q=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&page=${page}`;
  const resource = useCatalogue<ServiceListing[]>(path);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FIND THE WORK. AGREE ON THE DETAILS.</p>
          <h1>A clearer way to work together.</h1>
          <p className="muted">
            Discover services, define the outcome, and keep promises and evidence in a shared Pact.
          </p>
        </div>
        <Link className="button secondary" href="/workspace/services">
          Offer a service
        </Link>
      </div>
      <form
        className="market-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query);
          setPage(1);
        }}
      >
        <label>
          Search services
          <input
            name="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={120}
            placeholder="Backend development, resumes, design…"
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {['Development', 'Design', 'Writing', 'Consulting', 'Other'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="button">Search</button>
      </form>
      {resource.error && (
        <p role="alert" className="form-error">
          {resource.error}{' '}
          <button className="button secondary" onClick={resource.retry}>
            Try again
          </button>
        </p>
      )}
      {!resource.data && !resource.error && <p role="status">Loading services…</p>}
      {resource.data?.length === 0 && (
        <section className="empty-state">
          <h2>No matching services yet.</h2>
          <p>
            Try another search, offer your own service, or create a Pact directly with someone you
            know.
          </p>
          {(search || category || page > 1) && (
            <button
              className="button secondary"
              onClick={() => {
                setQuery('');
                setSearch('');
                setCategory('');
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}
          <Link className="text-link" href="/workspace/new">
            Create a direct agreement
          </Link>
        </section>
      )}
      <div className="market-grid">
        {resource.data?.map((s) => (
          <article className="market-listing" key={s.id}>
            <p className="eyebrow">{s.category}</p>
            <h2>
              <Link href={`/marketplace/${s.id}`}>{s.title}</Link>
            </h2>
            <p className="muted market-description">{s.description}</p>
            <p>By {s.display_name}</p>
            <p className="field-help">
              {s.review_count
                ? `${s.average_rating} / 5 · ${s.review_count} confirmed agreement reviews`
                : 'No confirmed agreement reviews yet'}
            </p>
            <p className="field-help">
              {s.paypal_ready
                ? 'PayPal account connected'
                : 'PayPal connection required before payment'}
            </p>
            <div className="market-price">
              <Price service={s} />
              <span>{s.delivery_days} day delivery</span>
            </div>
            <Link className="text-link" href={`/marketplace/${s.id}`}>
              Review the service →
            </Link>
          </article>
        ))}
      </div>
      <div className="market-actions">
        <button
          className="button secondary"
          disabled={page === 1 || !resource.data || !!resource.error}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="button secondary"
          disabled={!resource.data || !!resource.error || resource.data.length < 24}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      <section className="market-direct">
        <h2>Already found your person?</h2>
        <p>Create a private agreement directly. Both people use the same kind of Pact account.</p>
        <Link className="button secondary" href="/workspace/new">
          Create a Pact
        </Link>
      </section>
    </>
  );
}
export function ServiceDetail({ id }: { id: string }) {
  const resource = useCatalogue<ServiceListing>(`marketplace/${id}`);
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  async function request(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resource.data) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const pact = await api<{ id: string }>(`services/${id}/request`, {
        method: 'POST',
        body: JSON.stringify({
          requestId: key,
          expectedVersion: resource.data.version,
          paymentCondition: form.get('condition'),
          acceptedTerms: true,
        }),
      });
      router.push(`/workspace/pacts/${pact.id}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Agreement could not be confirmed. Refresh before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  const s = resource.data;
  return (
    <>
      <Link className="text-link breadcrumb" href="/marketplace">
        ← All services
      </Link>
      {resource.error && (
        <p role="alert">
          {resource.error}{' '}
          <button className="button secondary" onClick={resource.retry}>
            Try again
          </button>
        </p>
      )}
      {!s && !resource.error && <p role="status">Loading service…</p>}
      {s && (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{s.category}</p>
              <h1>{s.title}</h1>
              <p className="muted">Offered by {s.display_name}</p>
            </div>
          </div>
          <div className="market-detail">
            <section className="document-panel">
              <h2>What you are agreeing to</h2>
              <p className="preserve-lines">{s.description}</p>
              <h3>Acceptance criteria</h3>
              <p className="preserve-lines">{s.acceptance_criteria}</p>
              <h3>Expected evidence</h3>
              <p className="preserve-lines">{s.expected_evidence}</p>
              <p>{s.delivery_days} days after both members accept.</p>
              <Link href={`/workspace/sellers/${s.owner_id}`} className="text-link">
                View confirmed agreement reviews
              </Link>
            </section>
            <aside className="market-listing">
              <h2>
                <Price service={s} />
              </h2>
              <p>
                {s.paypal_ready
                  ? 'PayPal account connected. Permissions are rechecked before payment.'
                  : 'This person must connect PayPal before payment can begin.'}
              </p>
              <p>
                You are requesting an agreement. The other member must accept it. This does not
                charge you.
              </p>
              {session.status === 'authenticated' ? (
                <form className="market-form" onSubmit={request}>
                  <label>
                    When should payment happen?
                    <textarea
                      name="condition"
                      minLength={10}
                      maxLength={1000}
                      rows={3}
                      required
                      defaultValue="After both parties accept this Pact and the payer approves checkout."
                    />
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" required /> I have reviewed the service, price, delivery
                    time and acceptance criteria.
                  </label>
                  <button className="button" disabled={busy}>
                    {busy ? 'Creating agreement…' : 'Request this service'}
                  </button>
                </form>
              ) : (
                <Link
                  className="button"
                  href={`/sign-in?redirect_url=${encodeURIComponent(`/marketplace/${id}`)}`}
                >
                  Sign in to create an agreement
                </Link>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <p className="field-help">
                Sandbox payments only. Pact tracks agreements and supports human review; PayPal
                processes payments. AI is advisory.
              </p>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
