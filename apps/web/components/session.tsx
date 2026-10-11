'use client';
import { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useAuth, UserButton } from '@clerk/nextjs';
import { WorkspaceIntroduction } from './workspace-introduction';
type Session = {
  status: 'loading' | 'authenticated' | 'signed-out' | 'unavailable';
  getToken: () => Promise<string | null>;
};
const Context = createContext<Session>({ status: 'unavailable', getToken: async () => null });
function ConfiguredSession({ children }: { children: React.ReactNode }) {
  const { getToken: clerkToken, isLoaded, isSignedIn } = useAuth();
  const getToken = useCallback(() => clerkToken(), [clerkToken]);
  return (
    <Context.Provider
      value={{
        status: !isLoaded ? 'loading' : isSignedIn ? 'authenticated' : 'signed-out',
        getToken,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function SessionProvider({
  configured,
  children,
}: {
  configured: boolean;
  children: React.ReactNode;
}) {
  return configured ? (
    <ConfiguredSession>{children}</ConfiguredSession>
  ) : (
    <Context.Provider value={{ status: 'unavailable', getToken: async () => null }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  return useContext(Context);
}
export function AccountControl() {
  const { status } = useSession();
  return status === 'authenticated' ? (
    <UserButton />
  ) : (
    <Link className="text-link" href="/sign-in">
      Sign in
    </Link>
  );
}
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (status === 'authenticated') return children;
  if (status === 'signed-out') return <WorkspaceIntroduction />;
  return (
    <section className="loading-state" role="status">
      <p className="eyebrow">YOUR PRIVATE WORKSPACE</p>
      <h1>
        {status === 'loading'
          ? 'Checking your session.'
          : status === 'unavailable'
            ? 'Identity setup is required.'
            : 'A shared record starts with you.'}
      </h1>
      <p>
        {status === 'unavailable'
          ? 'Clerk has not been configured. Private records and financial actions remain unavailable.'
          : 'Sign in with a verified email to create Pacts and view the agreements you belong to.'}
      </p>
      <Link className="text-link" href="/preview">
        Explore the design preview
      </Link>
    </section>
  );
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly reason?: string,
  ) {
    super(message);
  }
}
export function useApi() {
  const { getToken } = useSession();
  return useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const token = await getToken();
      if (!token) throw new Error('Sign in again to continue.');
      const headers = new Headers(options.headers);
      headers.set('authorization', `Bearer ${token}`);
      if (options.body && !(options.body instanceof FormData))
        headers.set('content-type', 'application/json');
      let response: Response;
      let result: unknown;
      try {
        response = await fetch(`/api/pact/${path}`, {
          ...options,
          headers,
          cache: 'no-store',
          signal: options.signal ?? AbortSignal.timeout(50000),
        });
        result = await response.json();
      } catch {
        throw new ApiError(
          'Connection interrupted: Pact could not confirm the server response. Your request may already be saved. Refresh the record before retrying; do not start another payment.',
          'OUTCOME_UNKNOWN',
        );
      }
      const envelope = result as {
        data?: unknown;
        error?: { message?: unknown; reason?: unknown };
      };
      if (!response.ok)
        throw new ApiError(
          typeof envelope?.error?.message === 'string'
            ? envelope.error.message
            : 'This action could not be completed. Refresh before retrying.',
          typeof envelope?.error?.reason === 'string' ? envelope.error.reason : undefined,
        );
      if (!envelope || typeof envelope !== 'object' || !('data' in envelope))
        throw new ApiError(
          'The server response could not be read. Refresh the record before retrying.',
          'OUTCOME_UNKNOWN',
        );
      return envelope.data as T;
    },
    [getToken],
  );
}
export function useResource<T>(path: string) {
  const api = useApi();
  const session = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const generation = useRef({ value: 0 });
  const refresh = useCallback(async () => {
    if (session.status !== 'authenticated') return false;
    const request = ++generation.current.value;
    setLoading(true);
    try {
      const value = await api<T>(path);
      if (request !== generation.current.value) return false;
      setData(value);
      setError('');
      return true;
    } catch (e) {
      if (request === generation.current.value)
        setError(e instanceof Error ? e.message : 'Unable to load this record.');
      return false;
    } finally {
      if (request === generation.current.value) setLoading(false);
    }
  }, [api, path, session.status]);
  useEffect(() => {
    const counter = generation.current;
    void refresh();
    return () => {
      counter.value++;
    };
  }, [refresh, revision]);
  return {
    data,
    error,
    loading,
    refresh,
    reload: useCallback(() => setRevision((r) => r + 1), []),
  };
}
export function ResourceState({
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return (
    <section className="empty-state" role={error ? 'alert' : 'status'}>
      <h2>{error ? 'The record could not load.' : 'Loading your shared record.'}</h2>
      <p>{error || 'Your private data is being retrieved.'}</p>
      {error && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </section>
  );
}
