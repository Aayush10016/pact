import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';
import { Logo } from '../../../components/logo';
import styles from './sign-in.module.css';
export default function Authentication() {
  const configured = !!(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
  return (
    <div className={styles.page}>
      <header className={`marketing-header container ${styles.header}`}>
        <Link href="/" aria-label="Pact home">
          <Logo />
        </Link>
        <Link href="/" className="text-link">
          Back home
        </Link>
      </header>
      <main id="main" className={`container ${styles.layout}`}>
        <section className={styles.introduction} aria-labelledby="sign-in-title">
          <p className="eyebrow">PACT / VERIFIED IDENTITY</p>
          <h1 id="sign-in-title">
            Your promises.
            <br />
            Your shared record.
          </h1>
          <p className={styles.description}>
            Use a verified email. Each agreement is private to its members.
          </p>
          <div className={styles.record} aria-hidden="true">
            <p className="eyebrow">ONE SHARED RECORD</p>
            <ol>
              {['Commitment', 'Evidence', 'Fulfillment', 'Payment', 'Resolution'].map((step) => (
                <li key={step}>
                  <span />
                  {step}
                </li>
              ))}
            </ol>
            <p>From a clear promise to a documented outcome.</p>
          </div>
          <Link className="text-link" href="/preview">
            Explore the design preview
          </Link>
        </section>
        <section className={styles.authentication} aria-label="Sign in to Pact">
          {configured ? (
            <SignIn
              routing="path"
              path="/sign-in"
              fallbackRedirectUrl="/workspace"
              appearance={{
                elements: {
                  rootBox: styles.clerkRoot,
                  cardBox: styles.clerkCardBox,
                  card: styles.clerkCard,
                  headerTitle: styles.clerkTitle,
                },
              }}
            />
          ) : (
            <div className="notice" role="status">
              <p>
                Identity is not configured yet. Private workflows remain unavailable until the owner
                configures Clerk.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
