import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="container error-page">
      <p className="eyebrow">404 / NOT FOUND</p>
      <h1>This record isn’t here.</h1>
      <p>Check the address or return to your sample workspace.</p>
      <Link className="button" href="/workspace">
        Your pacts
      </Link>
    </main>
  );
}
