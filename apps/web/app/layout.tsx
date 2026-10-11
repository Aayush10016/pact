import { ClerkProvider } from '@clerk/nextjs';
import { SessionProvider } from '../components/session';
import type { Metadata } from 'next';
import '@fontsource-variable/manrope';
import '@fontsource-variable/source-serif-4';
import '@fontsource/ibm-plex-mono/400.css';
import './globals.css';
import './workspace-type.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'Pact — A promise, made clear.', template: '%s · Pact' },
  description:
    'Make the commitment. Prove the work. Resolve fairly. A trust layer for transactions between people.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <IdentityBoundary>{children}</IdentityBoundary>
      </body>
    </html>
  );
}

function IdentityBoundary({ children }: { children: React.ReactNode }) {
  const configured = !!(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
  const content = <SessionProvider configured={configured}>{children}</SessionProvider>;
  return configured ? (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        elements: {
          headerSubtitle: { color: '#566860' },
          dividerText: { color: '#566860' },
          formButtonPrimary: { backgroundImage: 'none', boxShadow: 'none' },
        },
        variables: {
          colorPrimary: '#215C49',
          colorBackground: '#F7F5EF',
          colorForeground: '#1D302A',
          borderRadius: '6px',
          fontFamily: 'Manrope Variable, sans-serif',
        },
      }}
    >
      {content}
    </ClerkProvider>
  ) : (
    content
  );
}
