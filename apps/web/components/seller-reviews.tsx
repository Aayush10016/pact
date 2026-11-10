'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { AccessGate, useApi, useResource, ResourceState } from './session';
import styles from './human-review.module.css';
type Review = { id: string; stars: number; body: string; created_at: string };
export function PactReview({ pactId }: { pactId: string }) {
  const record = useResource<{ eligible: boolean; sellerId: string | null; review: Review | null }>(
    `pacts/${pactId}/review`,
  );
  const api = useApi();
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  if (!record.data) return null;
  const r = record.data;
  return (
    <section className={styles.panel}>
      <h2>Verified seller review</h2>
      <p>
        One review per settled Pact, written by its payer. Reviews describe a person's experience,
        not a guarantee of future delivery.
      </p>
      {r.sellerId && (
        <Link href={`/workspace/sellers/${r.sellerId}`}>View this party's seller reviews</Link>
      )}
      {r.review ? (
        <p>
          Your Pact review: {r.review.stars}/5 · {r.review.body}
        </p>
      ) : r.eligible ? (
        <form
          className="draft-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (guard.current) return;
            guard.current = true;
            setBusy(true);
            setFeedback('');
            const d = new FormData(e.currentTarget);
            try {
              await api(`pacts/${pactId}/review`, {
                method: 'POST',
                body: JSON.stringify({ stars: Number(d.get('stars')), body: d.get('body') }),
              });
              setFeedback('Review published.');
              record.reload();
            } catch (e) {
              setFeedback(
                e instanceof Error
                  ? e.message
                  : 'Review could not be confirmed. Refresh before retrying.',
              );
            } finally {
              guard.current = false;
              setBusy(false);
            }
          }}
        >
          <label>
            Rating
            <select name="stars" required>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} out of 5
                </option>
              ))}
            </select>
          </label>
          <label>
            Your experience
            <textarea name="body" required minLength={10} maxLength={1500} />
          </label>
          <p>
            This text is visible to other signed-in Pact users. Do not include private messages,
            financial identifiers or personal contact details.
          </p>
          <label>
            <input type="checkbox" required /> Publish this review of my verified transaction.
          </label>
          <button className="button" disabled={busy}>
            Publish verified review
          </button>
        </form>
      ) : (
        <p>
          The payer can leave a review after payment is confirmed and the agreement or review is
          settled.
        </p>
      )}
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
export function SellerDirectory() {
  return (
    <AccessGate>
      <Directory />
    </AccessGate>
  );
}
function Directory() {
  const r =
    useResource<
      { id: string; display_name: string; review_count: number; average_rating: string }[]
    >('sellers');
  if (!r.data) return <ResourceState {...r} retry={r.reload} />;
  return (
    <>
      <p className="eyebrow">From verified Pact transactions</p>
      <h1>Seller reviews</h1>
      <p>Compare experiences and review counts. A rating is not a delivery guarantee.</p>
      {!r.data.length && <p>No verified reviews have been published yet.</p>}
      <ul className={styles.caseList}>
        {r.data.map((s) => (
          <li key={s.id}>
            <Link href={`/workspace/sellers/${s.id}`}>{s.display_name}</Link>
            <p>
              {s.average_rating}/5 · {s.review_count} verified review(s)
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
export function SellerProfile({ id }: { id: string }) {
  return (
    <AccessGate>
      <Profile id={id} />
    </AccessGate>
  );
}
function Profile({ id }: { id: string }) {
  const r = useResource<{ seller: null | { display_name: string }; reviews: Review[] }>(
    `sellers/${id}`,
  );
  if (!r.data) return <ResourceState {...r} retry={r.reload} />;
  return (
    <>
      <Link href="/workspace/sellers">All seller reviews</Link>
      <h1>{r.data.seller?.display_name ?? 'No published seller reviews'}</h1>
      <p>
        Reviews come from confirmed, settled Pact transactions. Sandbox test transactions are
        included; these are not production payment credentials.
      </p>
      <ul className={styles.caseList}>
        {r.data.reviews.map((v) => (
          <li key={v.id}>
            <strong>{v.stars}/5 · Verified Pact transaction</strong>
            <p>{v.body}</p>
            <time>{new Date(v.created_at).toLocaleDateString()}</time>
          </li>
        ))}
      </ul>
    </>
  );
}
