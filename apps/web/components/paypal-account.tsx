'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { PayPalAccountStatus } from '@pact/types';
import { AccessGate, ResourceState, useApi, useResource } from './session';
export function PayPalAccount() {
  return (
    <AccessGate>
      <Account />
    </AccessGate>
  );
}
function Account() {
  const account = useResource<PayPalAccountStatus>('me/paypal');
  const api = useApi();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function act(action: 'connect' | 'refresh', event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const value = await api<PayPalAccountStatus>(`me/paypal/${action}`, {
        method: 'POST',
        body: JSON.stringify(action === 'connect' ? { consent: true } : {}),
      });
      if (action === 'connect' && value.onboardingUrl) {
        const url = new URL(value.onboardingUrl);
        if (
          url.protocol !== 'https:' ||
          !['sandbox.paypal.com', 'www.sandbox.paypal.com'].includes(url.hostname)
        )
          throw new Error('PayPal returned an unexpected connection link.');
        window.location.assign(url.href);
      } else
        setMessage(
          value.status === 'READY'
            ? 'PayPal confirmed your account can receive Sandbox payments.'
            : 'PayPal has not confirmed all permissions yet. Complete its account steps and refresh.',
        );
      await account.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Connection could not be confirmed. Refresh before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ONE ACCOUNT. BOTH SIDES OF THE AGREEMENT.</p>
          <h1>Your payment connection.</h1>
          <p className="muted">
            Buy services, offer your work, and keep each agreement in one place.
          </p>
        </div>
      </div>
      <ResourceState {...account} retry={account.reload} />
      {account.data && (
        <section className="document-panel market-account">
          <h2>Connect with PayPal</h2>
          <p>
            Receiving payments requires PayPal to verify your account and grant Pact payment and
            refund permissions. You sign in on PayPal; Pact never asks for your PayPal password.
          </p>
          <p className="status-note">
            <strong>
              {
                {
                  NOT_CONNECTED: 'Not connected',
                  PENDING: 'Connection pending',
                  READY: 'PayPal connection verified',
                  RESTRICTED: 'PayPal needs more information',
                  REVOKED: 'PayPal permissions removed',
                }[account.data.status]
              }
            </strong>
          </p>
          {account.data.checkedAt && (
            <p className="field-help">
              Last checked: {new Date(account.data.checkedAt).toLocaleString()}
            </p>
          )}
          {!account.data.configured && (
            <div className="notice" role="status">
              <div>
                <h3>PayPal account connection is not available yet.</h3>
                <p>
                  Pact’s operator needs to finish PayPal platform setup before members can connect
                  an account. This is not a problem with your PayPal login. Retrying here will not
                  complete that setup.
                </p>
                <p>
                  You can prepare service listings and review existing agreements. Direct agreements
                  that pay a member’s own account require this setup first.
                </p>
              </div>
            </div>
          )}
          <p className="field-help">
            Test environment (PayPal Sandbox). No real money moves here. Use PayPal Sandbox test
            accounts, not your normal PayPal login. Real payments require Pact’s operator to
            complete PayPal’s live platform approval and setup. This verification confirms payment
            permissions, not the quality or trustworthiness of someone’s work. PayPal’s eligibility
            and country restrictions still apply.
          </p>
          {account.data.configured && account.data.status !== 'READY' && (
            <form onSubmit={(e) => act('connect', e)} className="market-form">
              <p className="field-help">
                {account.data.status === 'REVOKED'
                  ? 'Your earlier permissions were removed. Reconnect on PayPal to grant them again.'
                  : account.data.status === 'RESTRICTED'
                    ? 'PayPal has not confirmed all receiving permissions. Complete any requested account steps on PayPal, then check the connection here.'
                    : account.data.status === 'PENDING'
                      ? 'Finish the steps on PayPal, then check your connection below. Returning to Pact alone does not verify the account.'
                      : 'Continue to PayPal to connect a test account. You will return here to check its status.'}
              </p>
              <label className="checkbox-row">
                <input type="checkbox" required disabled={busy || !account.data.configured} /> I
                agree to share my PayPal account connection with Pact and authorize payment and
                refund permissions through PayPal.
              </label>
              <button className="button" disabled={busy || !account.data.configured}>
                Continue to PayPal Sandbox
              </button>
            </form>
          )}
          {account.data.configured && account.data.status !== 'NOT_CONNECTED' && (
            <form onSubmit={(e) => act('refresh', e)}>
              <button className="button secondary" disabled={busy}>
                {busy ? 'Checking…' : 'Check connection with PayPal'}
              </button>
            </form>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <p className="market-actions">
        <Link className="text-link" href="/workspace/services">
          Manage your services
        </Link>
        <Link className="text-link" href="/marketplace">
          Find a service
        </Link>
      </p>
    </>
  );
}
