import { expect, it } from 'vitest';
import { activityLabel } from '../src/payments/activity-label';
it('uses actual operation and provider event context and never equates receipt delivery with completion', () => {
  expect(activityLabel('PAYPAL_STATE_CONFIRMED', null, 'PAYMENT.CAPTURE.REFUNDED', null)).toBe(
    'Refund state verified with PayPal',
  );
  expect(activityLabel('PAYPAL_STATE_CONFIRMED', null, 'CHECKOUT.ORDER.APPROVED', null)).toBe(
    'Payment authorization confirmed by PayPal',
  );
  expect(activityLabel('PAYPAL_WEBHOOK_RECEIVED', null, 'PAYMENT.CAPTURE.COMPLETED', null)).toBe(
    'Payment update received from PayPal',
  );
  expect(activityLabel('FINANCIAL_ACTION_SUBMITTED', 'REFUND', null, null)).toBe(
    'Refund submitted to PayPal',
  );
  expect(activityLabel('APPROVAL_CREATED', 'REFUND', null, 'REJECTED')).toBe(
    'Refund rejected by a Pact member',
  );
  expect(activityLabel('FINANCIAL_ACTION_EXECUTED', 'REFUND', null, null)).toBe('Refund completed');
  expect(activityLabel('PAYPAL_STATE_CONFIRMED', null, null, null)).toBe(
    'Provider update verified',
  );
});
