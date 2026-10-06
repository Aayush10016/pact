'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';
import { ArrowUpRight, Plus } from 'lucide-react';
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <header className="app-header">
        <div className="container app-header-inner">
          <Link href="/" aria-label="Pact home">
            <Logo />
          </Link>
          <nav aria-label="Workspace">
            <Link href="/workspace" aria-current={path === '/workspace' ? 'page' : undefined}>
              Your pacts
            </Link>
            <Link
              href="/workspace/activity"
              aria-current={path === '/workspace/activity' ? 'page' : undefined}
            >
              Activity
            </Link>
          </nav>
          <Link className="button small" href="/workspace/new">
            <Plus size={16} />
            New pact
          </Link>
          <span className="avatar own" aria-label="Preview workspace">
            P
          </span>
        </div>
      </header>
      <div className="preview-bar">
        <div className="container">
          <span className="mono">PHASE 1 PREVIEW</span>
          <span>Illustrative records. No real payments or accounts.</span>
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
        <span className="mono">FOUNDATION / 01</span>
      </footer>
    </>
  );
}
