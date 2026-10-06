'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search, ArrowRight, CalendarDays, Circle } from 'lucide-react';
import { demoPacts, statusLabels, formatMoney } from '@pact/shared';
export function WorkspaceView() {
  const [filter, setFilter] = useState('All pacts');
  const [query, setQuery] = useState('');
  const visible = demoPacts.filter(
    (p) =>
      (filter === 'All pacts' ||
        (filter === 'Needs attention' && p.status !== 'ACTIVE') ||
        (filter === 'In progress' && p.status === 'ACTIVE')) &&
      `${p.title} ${p.otherParty}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORK, ON THE SAME PAGE.</p>
          <h1>Your pacts.</h1>
          <p className="muted">A clear view of the promises in progress.</p>
        </div>
        <span className="mono sample-label">SAMPLE WORKSPACE</span>
      </div>
      <section className="attention-panel" aria-labelledby="attention-title">
        <div>
          <span className="eyebrow">NEXT STEP</span>
          <h2 id="attention-title">
            The identity is ready.
            <br />
            Your review comes next.
          </h2>
          <p>Maya delivered the final brand package. Review it against the agreed commitments.</p>
          <Link className="button small" href="/workspace/pacts/brand-identity">
            Review delivery <ArrowRight size={16} />
          </Link>
        </div>
        <div className="attention-summary">
          <span className="mini-label">FIELDWORK / BRAND IDENTITY</span>
          <span className="badge">Ready for review</span>
          <div>
            <span className="muted">Milestones delivered</span>
            <strong className="mono">
              2 <span>/ 3</span>
            </strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Milestones delivered"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={2}
          >
            <span style={{ width: '66.66%' }} />
          </div>
          <p className="muted">Illustrative progress, pending your review.</p>
        </div>
      </section>
      <section aria-labelledby="pacts-title" className="pacts-section">
        <div className="section-toolbar">
          <h2 id="pacts-title">
            Agreements <span className="count">{demoPacts.length}</span>
          </h2>
          <label className="search">
            <Search size={16} />
            <span className="sr-only">Search pacts</span>
            <input
              type="search"
              placeholder="Find a pact or person"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="filters" role="group" aria-label="Filter pacts">
          {['All pacts', 'Needs attention', 'In progress'].map((label) => (
            <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>
              {label}
            </button>
          ))}
        </div>
        {visible.length ? (
          <div className="pact-table">
            <div className="pact-table-head" aria-hidden="true">
              <span>PACT / OTHER PARTY</span>
              <span>STATUS</span>
              <span>AGREED AMOUNT</span>
              <span>NEXT MILESTONE</span>
              <span />
            </div>
            {visible.map((p) => (
              <article className="pact-row" key={p.id}>
                <div className="pact-name">
                  <span className={`avatar ${p.id === 'brand-identity' ? 'clay' : ''}`}>
                    {p.initials}
                  </span>
                  <div>
                    <Link href={`/workspace/pacts/${p.id}`}>{p.title}</Link>
                    <p>
                      {p.otherParty} <span>·</span> {p.category}
                    </p>
                  </div>
                </div>
                <span
                  className={`badge ${p.status === 'DISPUTED' ? 'warning' : p.status === 'ACTIVE' ? 'neutral' : ''}`}
                >
                  {statusLabels[p.status]}
                </span>
                <span className="mono pact-money">{formatMoney(p.money)}</span>
                <div className="milestone-cell">
                  <span className="mono">
                    {p.completedMilestones} / {p.totalMilestones} milestones
                  </span>
                  <p>
                    <CalendarDays size={13} />
                    {new Date(`${p.due}T12:00:00Z`).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </p>
                </div>
                <Link
                  className="row-arrow"
                  href={`/workspace/pacts/${p.id}`}
                  aria-label={`Open ${p.title}`}
                >
                  <ArrowUpRight size={20} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state" role="status">
            <Search size={24} />
            <h3>No pacts match.</h3>
            <p>Try another name or choose a different filter.</p>
            <button
              className="button secondary"
              onClick={() => {
                setQuery('');
                setFilter('All pacts');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
      <div className="workspace-bottom">
        <section>
          <div className="section-toolbar">
            <h2>Ahead this week</h2>
            <span className="mono">ILLUSTRATIVE</span>
          </div>
          <div className="upcoming">
            <span className="date-block">
              <strong>09</strong>OCT
            </span>
            <div>
              <h3>Final identity review</h3>
              <p>Fieldwork · Brand & design</p>
            </div>
            <span className="badge neutral">Your review</span>
          </div>
          <div className="upcoming">
            <span className="date-block">
              <strong>14</strong>OCT
            </span>
            <div>
              <h3>Homepage delivery</h3>
              <p>Studio website · Development</p>
            </div>
            <span className="badge neutral">Delivery</span>
          </div>
        </section>
        <section>
          <div className="section-toolbar">
            <h2>Recent activity</h2>
            <Link className="text-link" href="/workspace/activity">
              View record <ArrowRight size={15} />
            </Link>
          </div>
          <ol className="compact-timeline">
            <li>
              <Circle size={10} />
              <div>
                <strong>Maya shared the final identity package</strong>
                <p>Fieldwork · Oct 6, 2026</p>
              </div>
            </li>
            <li>
              <Circle size={10} />
              <div>
                <strong>Homepage milestone marked in progress</strong>
                <p>Studio website · Oct 5, 2026</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </>
  );
}
