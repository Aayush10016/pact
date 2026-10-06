import type { Metadata } from 'next';
import '@fontsource-variable/manrope';
import '@fontsource-variable/source-serif-4';
import '@fontsource/ibm-plex-mono/400.css';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Pact — A promise, made clear.', template: '%s · Pact' },
  description: 'Make the commitment. Prove the work. Resolve fairly. A trust layer for transactions between people.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
