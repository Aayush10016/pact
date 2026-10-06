import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';
import { Logo } from '../../../components/logo';
export default function Authentication() {
  const configured = !!(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
  return (
    <>
      <header className="marketing-header container">
        <Link href="/" aria-label="Pact home">
          <Logo />
        </Link>
        <Link href="/" className="text-link">
          Back home
        </Link>
      </header>
      <main id="main" className="container about-page">
        <p className="eyebrow">PACT / VERIFIED IDENTITY</p>
        <h1>
          Your promises.
          <br />
          Your shared record.
        </h1>
        <p className="lead">Use a verified email. Each agreement is private to its members.</p>
        {configured ? (
          <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/workspace" />
        ) : (
          <div className="notice" role="status">
            <p>
              Identity is not configured yet. Private workflows remain unavailable until the owner
              configures Clerk.
            </p>
          </div>
        )}
        <Link className="text-link" href="/preview">
          Explore the design preview
        </Link>
      </main>
    </>
  );
}
