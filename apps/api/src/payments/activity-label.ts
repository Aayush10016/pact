export function activityLabel(
  event: string,
  operation: string | null,
  providerEvent: string | null,
  decision: string | null,
) {
  const financial =
    operation === 'REFUND' || providerEvent === 'PAYMENT.CAPTURE.REFUNDED'
      ? 'Refund'
      : ['ORDER', 'CAPTURE'].includes(operation ?? '') ||
          [
            'CHECKOUT.ORDER.APPROVED',
            'PAYMENT.CAPTURE.COMPLETED',
            'PAYMENT.CAPTURE.DENIED',
          ].includes(providerEvent ?? '')
        ? 'Payment'
        : null;
  const labels: Record<string, string> = {
    PACT_CREATED: 'Pact created',
    PACT_ACTIVATED: 'Both parties accepted the Pact',
    PACT_DISPUTED: 'Resolution requested',
    PACT_RESOLUTION_CONCERN: 'Resolution concern recorded',
    PACT_COMPLETED: 'Pact completed',
    PACT_CANCELLED: 'Pact cancelled',
    COMMITMENT_CREATED: 'Commitment recorded',
    MILESTONE_CREATED: 'Milestone recorded',
    MILESTONE_DELIVERED: 'Delivery recorded',
    PAYMENT_AUTHORIZED_BY_PROVIDER: 'Payment authorization received',
    PAYMENT_CAPTURED: 'Payment completed',
    PAYMENT_DECLINED: 'Payment declined',
    PAYMENT_RECONCILIATION_REQUIRED: 'Payment needs review',
    PAYMENT_PREFLIGHT_FAILED: 'Checkout could not be verified',
    RESOLUTION_CONFIRMED_NO_FINANCIAL_ACTION: 'Agreed outcome confirmed; payment retained',
    APPROVALS_INVALIDATED: 'Earlier decisions retired',
  };
  if (labels[event]) return labels[event];
  if (event === 'RESOLUTION_PROPOSED')
    return operation === 'REFUND' ? 'Refund requested' : 'Resolution proposed';
  if (event === 'RESOLUTION_CHANGED')
    return operation === 'REFUND' ? 'Refund proposal revised' : 'Resolution revised';
  if (event === 'APPROVAL_CREATED')
    return `${operation === 'REFUND' ? 'Refund' : 'Resolution'} ${decision === 'REJECTED' ? 'rejected' : 'approved'} by a Pact member`;
  if (event === 'FINANCIAL_ACTION_APPROVED')
    return financial ? `${financial} approved by both parties` : 'Agreed action approved';
  if (event === 'PAYMENT_INITIATED')
    return operation === 'ORDER' ? 'Payment checkout requested' : 'Payment capture requested';
  if (event === 'FINANCIAL_OPERATION_STARTED')
    return operation === 'ORDER'
      ? 'Payment checkout processing'
      : `${financial ?? 'Financial action'} processing`;
  if (event === 'FINANCIAL_ACTION_SUBMITTED')
    return operation === 'ORDER'
      ? 'Payment checkout ready for authorization'
      : `${financial ?? 'Financial action'} submitted to PayPal`;
  if (event === 'FINANCIAL_ACTION_EXECUTED')
    return operation === 'REFUND' ? 'Refund completed' : 'Financial action confirmed';
  if (event === 'PAYPAL_WEBHOOK_RECEIVED')
    return financial ? `${financial} update received from PayPal` : 'Provider update received';
  if (event === 'PAYPAL_STATE_CONFIRMED') {
    if (providerEvent === 'CHECKOUT.ORDER.APPROVED')
      return 'Payment authorization confirmed by PayPal';
    if (providerEvent === 'PAYMENT.CAPTURE.DENIED') return 'Payment decline confirmed by PayPal';
    return financial ? `${financial} state verified with PayPal` : 'Provider update verified';
  }
  if (event === 'PAYPAL_OPERATION_RECONCILED')
    return operation === 'ORDER'
      ? 'Payment checkout verified'
      : `${financial ?? 'Financial action'} completed`;
  if (event.startsWith('RECONCILIATION_'))
    return `${financial ?? 'Financial record'} review recorded`;
  return event
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
