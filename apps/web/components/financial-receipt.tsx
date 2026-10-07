'use client';
import Link from 'next/link';
import type { FinancialReceipt, ReceiptSummary } from '@pact/types';
import { formatMoney } from '@pact/shared';
import { ArrowLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { AccessGate, ResourceState, useResource } from './session';
import styles from './financial-receipt.module.css';
export function FinancialReceiptView({
  pactId,
  kind,
  receiptId,
}: {
  pactId: string;
  kind: string;
  receiptId: string;
}) {
  return (
    <AccessGate>
      <PrivateReceipt pactId={pactId} kind={kind} receiptId={receiptId} />
    </AccessGate>
  );
}
function PrivateReceipt({
  pactId,
  kind,
  receiptId,
}: {
  pactId: string;
  kind: string;
  receiptId: string;
}) {
  const record = useResource<FinancialReceipt>(`pacts/${pactId}/receipts/${kind}/${receiptId}`);
  if (record.loading || record.error || !record.data)
    return <ResourceState loading={record.loading} error={record.error} retry={record.reload} />;
  return <ReceiptDocument receipt={record.data} />;
}
export function ReceiptDocument({ receipt: r }: { receipt: FinancialReceipt }) {
  const payment = r.kind === 'payment';
  const date = (value: string) =>
    new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' });
  return (
    <>
      <Link className="text-link breadcrumb" href={`/workspace/pacts/${r.pactId}`}>
        <ArrowLeft size={16} aria-hidden="true" /> Shared Pact record
      </Link>
      <article className={styles.receipt} aria-labelledby="receipt-title">
        <header className={styles.header}>
          <p className="eyebrow">PACT / {payment ? 'PAYMENT' : 'REFUND'} RECEIPT</p>
          <p className={styles.confirmed}>
            <CheckCircle2 size={18} aria-hidden="true" /> Confirmed by PayPal
          </p>
        </header>
        <h1 id="receipt-title">{payment ? 'Payment' : 'Refund'} completed.</h1>
        <p className={styles.amount}>
          {formatMoney({ amountMinor: r.amountMinor, currency: r.currency })}{' '}
          <span>{r.currency}</span>
        </p>
        <p className={styles.intro}>
          {payment
            ? 'The captured payment is documented in this shared record.'
            : 'PayPal completed the refund against the original captured payment.'}
        </p>
        <dl className={styles.fields}>
          <div>
            <dt>{payment ? 'Payment' : 'Refund'} status</dt>
            <dd>COMPLETED{payment ? ' / CAPTURED' : ''}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{r.provider}</dd>
          </div>
          <div>
            <dt>Pact</dt>
            <dd>
              {r.pactTitle}
              <span className={styles.identifier}>{r.pactId}</span>
            </dd>
          </div>
          <div>
            <dt>{payment ? 'Captured at' : 'Refunded at'}</dt>
            <dd>{r.occurredAt ? date(r.occurredAt) : 'Timestamp not provided by PayPal'}</dd>
          </div>
          <div>
            <dt>Confirmed in Pact</dt>
            <dd>{date(r.confirmedAt)}</dd>
          </div>
          <div>
            <dt>PayPal Order ID</dt>
            <dd className={styles.identifier}>{r.orderId}</dd>
          </div>
          <div>
            <dt>PayPal Capture ID</dt>
            <dd className={styles.identifier}>{r.captureId}</dd>
          </div>
          {!payment && (
            <div>
              <dt>PayPal Refund ID</dt>
              <dd className={styles.identifier}>{r.refundId}</dd>
            </div>
          )}
          <div>
            <dt>Pact payer</dt>
            <dd>{r.payer}</dd>
          </div>
          <div>
            <dt>Pact payee</dt>
            <dd>{r.payee}</dd>
          </div>
        </dl>
        <footer className={styles.footer}>
          <p>
            Sandbox record. Checkout pays the configured PayPal developer merchant; Pact member
            roles identify the agreement’s parties.
          </p>
          {!payment && (
            <p>
              The refund applies to the payer’s original PayPal payment. Availability in the
              original funding account follows PayPal and funding-provider processing.
            </p>
          )}
        </footer>
      </article>
    </>
  );
}
export function FinancialRecords({ pactId }: { pactId: string }) {
  const receipts = useResource<ReceiptSummary[]>(`pacts/${pactId}/receipts`);
  return (
    <section className={styles.summary} aria-label="Confirmed financial records">
      <h3>Financial records</h3>
      {receipts.loading || receipts.error ? (
        <ResourceState loading={receipts.loading} error={receipts.error} retry={receipts.reload} />
      ) : !receipts.data?.length ? (
        <p>
          No confirmed financial receipt yet. Approval and submitted requests do not confirm
          payment.
        </p>
      ) : (
        receipts.data.map((r) => (
          <div key={`${r.kind}-${r.id}`}>
            <p>
              <strong>{r.kind === 'payment' ? 'Payment completed' : 'Refund completed'}</strong>
              <br />
              {formatMoney({ amountMinor: r.amountMinor, currency: r.currency })} {r.currency} ·
              Confirmed by PayPal
            </p>
            <Link
              className="text-link"
              href={`/workspace/pacts/${pactId}/receipts/${r.kind}/${r.id}`}
            >
              View {r.kind} receipt <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        ))
      )}
    </section>
  );
}
