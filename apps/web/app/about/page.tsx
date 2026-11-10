import Link from 'next/link';
import { Logo } from '../../components/logo';
import { ArrowLeft, ArrowRight } from 'lucide-react';
export default function About() {
  return (
    <>
      <header className="marketing-header container">
        <Link href="/" aria-label="Pact home">
          <Logo />
        </Link>
        <Link className="text-link" href="/">
          <ArrowLeft size={16} />
          Back home
        </Link>
      </header>
      <main id="main" className="container about-page">
        <p className="eyebrow">PACT / LIFECYCLE 02</p>
        <h1>
          A clear beginning.
          <br />A deliberate boundary.
        </h1>
        <p className="lead">
          Pact is a trust layer for transactions between people who don’t know each other. The
          private workspace connects agreements, evidence, advisory reasoning, and human decisions.
        </p>
        <div className="about-grid">
          <section>
            <h2>Ready to explore</h2>
            <ul>
              <li>The branded product experience</li>
              <li>Persistent agreements and verified invitations</li>
              <li>Private evidence with immutable versions</li>
              <li>Commitments, evidence, assessment, and resolution layouts</li>
            </ul>
          </section>
          <section>
            <h2>Before live validation</h2>
            <ul>
              <li>Configure Clerk and two verified test accounts</li>
              <li>Configure a private R2 bucket</li>
              <li>Configure NVIDIA Nemotron advisory reasoning</li>
              <li>Configure PayPal Sandbox and a verified webhook</li>
            </ul>
          </section>
        </div>
        <div className="notice">
          <p>
            <strong>AI understands. AI recommends. Humans authorize. PayPal executes.</strong>
            <br />
            Sandbox actions require explicit human consent. Unconfigured providers remain
            unavailable; the design preview uses labeled sample records.
          </p>
        </div>
        <Link className="button" href="/workspace">
          Explore the workspace <ArrowRight size={16} />
        </Link>
      </main>
    </>
  );
}
