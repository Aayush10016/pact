import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, FileText, LockKeyhole, CircleCheck } from 'lucide-react';
import { Logo } from '../components/logo';
export default function Home() {
  return (
    <>
      <header className="marketing-header container">
        <Link href="/" aria-label="Pact home">
          <Logo />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#built-for-trust">Built for trust</a>
        </nav>
        <Link className="button secondary small" href="/workspace">
          Explore Pact <ArrowUpRight size={16} />
        </Link>
      </header>
      <main id="main">
        <section className="hero container">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-square" />A promise, made clear.
            </p>
            <h1>
              Make the commitment.
              <br />
              Prove the work.
              <br />
              <em>Resolve fairly.</em>
            </h1>
            <p className="hero-description">
              Good work starts with an agreement. Pact keeps the promise, the evidence, and the
              outcome in one shared record.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/workspace">
                Explore the workspace <ArrowRight size={18} />
              </Link>
              <a className="text-link" href="#how-it-works">
                See how it works <span>↗</span>
              </a>
            </div>
            <p className="quiet-caption">
              <LockKeyhole size={14} />
              Your agreement. Your decision. Always.
            </p>
          </div>
          <div className="hero-record">
            <div className="record-top">
              <span className="mono">THE SHARED RECORD</span>
              <span className="mono">PACT / 001</span>
            </div>
            <div className="record-paper">
              <div className="record-title-row">
                <span className="mini-label">BRAND & DESIGN</span>
                <span className="badge">Ready for review</span>
              </div>
              <h2>
                A new identity
                <br />
                for Fieldwork.
              </h2>
              <div className="parties">
                <span className="avatar">JC</span>
                <span>Jamie Cooper</span>
                <span className="party-connector">↔</span>
                <span className="avatar clay">MC</span>
                <span>Maya Chen</span>
              </div>
              <div className="record-amount">
                <span>Agreed amount</span>
                <strong className="mono">
                  $2,400.00 <small>USD</small>
                </strong>
              </div>
              <div className="record-line">
                <CircleCheck size={19} />
                <div>
                  <strong>The commitment</strong>
                  <p>Brand identity, guidelines, and final assets.</p>
                </div>
              </div>
              <div className="record-line">
                <FileText size={19} />
                <div>
                  <strong>The evidence</strong>
                  <p>Final identity package delivered for review.</p>
                </div>
                <span className="mono evidence-count">03</span>
              </div>
              <div className="record-next">
                <span className="mini-label">NEXT, TOGETHER</span>
                <p>Review the work. Confirm the outcome.</p>
                <Link
                  href="/workspace/pacts/brand-identity"
                  aria-label="Open sample brand identity Pact"
                >
                  <ArrowUpRight size={22} />
                </Link>
              </div>
            </div>
            <div className="record-bottom">
              <span>
                <span className="tiny-square" />
                Clear from the beginning.
              </span>
              <span>Fair through the finish.</span>
            </div>
          </div>
        </section>
        <section className="principle-strip">
          <div className="container">
            <span>FOR WORK BETWEEN PEOPLE</span>
            <p>
              Freelancers & clients <i>·</i> Creators & partners <i>·</i> Sellers & buyers
            </p>
          </div>
        </section>
        <section id="how-it-works" className="how-section container">
          <div className="section-intro">
            <p className="eyebrow">FROM AGREEMENT TO OUTCOME</p>
            <h2>
              Less uncertainty.
              <br />
              More common ground.
            </h2>
            <p>
              A transaction is more than a payment.
              <br />
              Give the whole story a place to live.
            </p>
          </div>
          <div className="workflow-grid">
            {[
              {
                n: '01',
                title: 'Make it clear.',
                body: 'Define the deliverables, milestones, and payment conditions. Both sides know what good looks like.',
              },
              {
                n: '02',
                title: 'Keep the record.',
                body: 'Connect each delivery, message, and document to the promise it supports. Nothing lost in the thread.',
              },
              {
                n: '03',
                title: 'Find a fair outcome.',
                body: 'See what the evidence supports. Review a recommendation. People make the final decision.',
              },
            ].map((item) => (
              <article key={item.n}>
                <div className="workflow-number">
                  <span className="mono">{item.n}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="built-for-trust" className="trust-section">
          <div className="container trust-layout">
            <div>
              <p className="eyebrow">TRUST IS A PROCESS.</p>
              <h2>
                Understanding can be assisted.
                <br />
                <em>Authority stays human.</em>
              </h2>
              <p>
                Pact is designed to help people understand what happened. Every financial action
                needs explicit authorization. PayPal executes approved actions.
              </p>
              <Link className="text-link light" href="/about">
                Our foundation, explained <ArrowUpRight size={17} />
              </Link>
            </div>
            <ul className="trust-list">
              <li>
                <Check size={18} />
                <span>A shared view of what was promised</span>
              </li>
              <li>
                <Check size={18} />
                <span>Evidence connected to commitments</span>
              </li>
              <li>
                <Check size={18} />
                <span>Recommendations you can question</span>
              </li>
              <li>
                <Check size={18} />
                <span>Human approval before money moves</span>
              </li>
            </ul>
          </div>
        </section>
        <section className="closing container">
          <p className="eyebrow">START WITH COMMON GROUND.</p>
          <h2>
            Good agreements deserve
            <br />a better place to live.
          </h2>
          <Link className="button" href="/workspace">
            Take a look inside <ArrowRight size={18} />
          </Link>
          <p className="muted">Explore the Phase 1 product preview.</p>
        </section>
      </main>
      <footer className="marketing-footer container">
        <Logo />
        <p>A trust layer for transactions between people.</p>
        <Link href="/about">
          Product foundation <ArrowUpRight size={15} />
        </Link>
        <span className="mono">© 2026 PACT</span>
      </footer>
    </>
  );
}
