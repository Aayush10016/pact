import Link from 'next/link';
export default async function Return({
  searchParams,
}: {
  searchParams: Promise<{ pact?: string }>;
}) {
  const { pact } = await searchParams;
  const valid = pact && /^[a-f0-9-]{36}$/.test(pact);
  return (
    <section className="draft-success">
      <p className="eyebrow">PAYPAL SANDBOX / RETURN</p>
      <h1>Review the next step.</h1>
      <p>
        Returning from PayPal does not confirm payment. Open your Pact to request capture; the
        shared record will update only after verified server-side confirmation.
      </p>
      <Link className="button" href={valid ? `/workspace/pacts/${pact}` : '/workspace'}>
        Return to your shared record
      </Link>
    </section>
  );
}
