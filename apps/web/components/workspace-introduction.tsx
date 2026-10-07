import Link from 'next/link';
import styles from './workspace-introduction.module.css';

export function WorkspaceIntroduction() {
  return (
    <section className={styles.introduction} aria-labelledby="workspace-introduction-title">
      <div className={styles.message}>
        <p className={`eyebrow ${styles.eyebrow}`}>YOUR PRIVATE WORKSPACE</p>
        <h1 id="workspace-introduction-title">A shared record starts with you.</h1>
        <p className={styles.description}>
          Sign in with a verified email to create Pacts and view the agreements you belong to.
        </p>
        <div className={styles.actions}>
          <Link className="button" href="/sign-in">
            Sign in to Pact
          </Link>
          <Link className="text-link" href="/preview">
            Explore the design preview
          </Link>
        </div>
      </div>
      <div className={styles.artifact} aria-hidden="true">
        <div className={styles.parties}>
          <div>
            <span className="mini-label">PERSON A</span>
            <p>Your promise.</p>
          </div>
          <div>
            <span className="mini-label">PERSON B</span>
            <p>Their promise.</p>
          </div>
        </div>
        <div className={styles.join} />
        <div className={styles.record}>
          <div className={styles.recordHeader}>
            <span className="mono">THE SHARED RECORD</span>
            <span className={styles.recordMark}>A + B</span>
          </div>
          <h2>
            One promise.
            <br />
            Both perspectives.
          </h2>
          <div className={styles.entries}>
            <div>
              <span className="mono">01</span>
              <span>Commitment</span>
              <span>What we agree to.</span>
            </div>
            <div>
              <span className="mono">02</span>
              <span>Evidence</span>
              <span>What was delivered.</span>
            </div>
            <div>
              <span className="mono">03</span>
              <span>Outcome</span>
              <span>What we decide.</span>
            </div>
          </div>
          <p className={styles.recordFooter}>Two people. One place for the whole story.</p>
        </div>
        <p className={styles.caption}>PACT / AN ILLUSTRATION OF A SHARED RECORD</p>
      </div>
    </section>
  );
}
