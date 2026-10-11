'use client';
import { ReviewDeskLink } from './human-review';
import { AccountControl } from './session';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';
import { ArrowUpRight, Plus } from 'lucide-react';
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const preview = path.startsWith('/preview');
  const prefix = preview ? '/preview' : '/workspace';
  return (
    <>
      <header className="app-header">
        <div className="container app-header-inner">
          <Link href="/" aria-label="Pact home">
            <Logo />
          </Link>
          <nav aria-label="Workspace">
            {!preview && <Link href="/workspace/sellers">Seller reviews</Link>}
            {!preview && <ReviewDeskLink />}
            <Link href={prefix} aria-current={path === '/workspace' ? 'page' : undefined}>
              Your pacts
            </Link>
            <Link
              href={preview ? '/preview' : '/workspace/activity'}
              aria-current={path === '/workspace/activity' ? 'page' : undefined}
            >
              Activity
            </Link>
          </nav>
          <Link className="button small" href={`${prefix}/new`}>
            <Plus size={16} />
            New pact
          </Link>
          {preview ? (
            <span className="avatar own" aria-label="Preview workspace">
              P
            </span>
          ) : (
            <AccountControl />
          )}
        </div>
      </header>
      <div className="preview-bar">
        <div className="container">
          <span className="mono">{preview ? 'DESIGN PREVIEW' : 'PRIVATE WORKSPACE'}</span>
          <span>
            {preview
              ? 'Illustrative records. No real payments or accounts.'
              : 'Shared with Pact members. Sandbox payments only.'}
          </span>
          <Link href="/about">
            About this foundation <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <main id="main" className="container workspace">
        {children}
      </main>
      <footer className="app-footer container">
        <Logo />
        <span>A clear record. A fairer outcome.</span>
        <span className="mono">PACT / 02</span>
      </footer>
    </>
  );
}
