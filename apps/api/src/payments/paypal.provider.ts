import { Injectable, ServiceUnavailableException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
export function decimalAmount(minor: string) {
  const n = BigInt(minor);
  if (n <= 0n) throw new Error('Positive amount required');
  return `${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
}
export function minorAmount(decimal: string) {
  if (!/^\d+\.\d{2}$/.test(decimal)) throw new Error('Invalid provider amount');
  const [a, b] = decimal.split('.');
  return (BigInt(a!) * 100n + BigInt(b!)).toString();
}
export class ProviderError extends Error {
  constructor(
    readonly uncertain: boolean,
    readonly diagnostic: {
      http?: number;
      name?: string;
      issue?: string;
      debugId?: string;
    } = {},
  ) {
    super('Payment provider unavailable');
  }
  get userMessage(): string {
    if (this.uncertain)
      return 'PayPal returned an uncertain result. Refresh the record and reconcile the existing operation before trying another payment.';
    if (this.diagnostic.http === 404)
      return 'PayPal cannot find the stored resource with the configured Sandbox app. Verify the app and resource in PayPal before continuing. Payment has not been confirmed.';
    if ([401, 403].includes(this.diagnostic.http ?? 0))
      return 'PayPal rejected the Sandbox app credentials or permissions. Check the local configuration before continuing.';
    return 'PayPal could not verify this request. Check the existing order in PayPal and try again after resolving the provider error.';
  }
}
export class CheckoutUnavailableError extends ProviderError {
  get userMessage() {
    return 'The stored order cannot be accessed with the current PayPal Sandbox app. Changing app credentials does not transfer an existing checkout to the new merchant. Restore the original app to continue this order, or verify that it has no completed payment before creating a new Pact and checkout with the current app. This Pact has no confirmed payment.';
  }
}
async function providerFailure(response: Response, uncertain: boolean) {
  // Only machine identifiers are retained. Never copy provider messages, headers, or bodies to logs.
  const identifier = (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : undefined;
  let detail: {
    name?: unknown;
    error?: unknown;
    debug_id?: unknown;
    details?: { issue?: unknown }[];
  } = {};
  try {
    const raw = await response.text();
    if (raw.length <= 65536) detail = JSON.parse(raw);
  } catch {
    /* The status remains useful when the provider sends malformed JSON. */
  }
  return new ProviderError(uncertain, {
    http: response.status,
    name: identifier(detail?.name ?? detail?.error),
    issue: identifier(detail?.details?.[0]?.issue),
    debugId: identifier(detail?.debug_id),
  });
}
export const resourceSchema = z
  .object({
    id: z.string().min(1).max(100),
    status: z.string(),
    amount: z.object({ currency_code: z.string(), value: z.string() }).optional(),
    links: z.array(z.object({ href: z.url(), rel: z.string() })).optional(),
    supplementary_data: z
      .object({
        related_ids: z
          .object({ order_id: z.string().optional(), capture_id: z.string().optional() })
          .optional(),
      })
      .optional(),
  })
  .passthrough();
export const orderSchema = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    purchase_units: z
      .array(
        z.object({
          custom_id: z.string().optional(),
          payee: z.object({ merchant_id: z.string().max(100).optional() }).optional(),
          amount: z.object({ currency_code: z.string(), value: z.string() }).optional(),
          payments: z.object({ captures: z.array(resourceSchema).optional() }).optional(),
        }),
      )
      .optional(),
    links: z.array(z.object({ href: z.url(), rel: z.string() })).optional(),
  })
  .passthrough();
export function validateCaptureOrder(
  order: z.infer<typeof orderSchema>,
  tx: {
    id: string;
    order_id: string;
    amount_minor: string;
    currency: string;
  },
) {
  const unit = order.purchase_units?.[0];
  if (
    !unit ||
    order.id !== tx.order_id ||
    order.purchase_units?.length !== 1 ||
    unit.custom_id !== tx.id ||
    (order.intent !== undefined && order.intent !== 'CAPTURE')
  )
    throw new ConflictException(
      'PayPal order does not match this payment. Reconciliation is required.',
    );
  try {
    if (
      !unit.amount ||
      unit.amount.currency_code !== tx.currency ||
      minorAmount(unit.amount.value) !== tx.amount_minor
    )
      throw new Error('Amount mismatch');
  } catch {
    throw new ConflictException(
      'PayPal order amount or currency differs from the Pact. No capture is allowed.',
    );
  }
}
export interface PaymentProvider {
  createOrder(
    id: string,
    minor: string,
    currency: string,
    key: string,
    pactId?: string,
  ): Promise<z.infer<typeof orderSchema>>;
  capture(orderId: string, key: string): Promise<z.infer<typeof orderSchema>>;
  refund(
    captureId: string,
    minor: string,
    currency: string,
    key: string,
  ): Promise<z.infer<typeof resourceSchema>>;
  verify(headers: Record<string, string>, event: unknown): Promise<boolean>;
  getOrder(id: string): Promise<z.infer<typeof orderSchema>>;
  getCapture(id: string): Promise<z.infer<typeof resourceSchema>>;
  getRefund(id: string): Promise<z.infer<typeof resourceSchema>>;
}
@Injectable()
export class PayPalProvider implements PaymentProvider {
  private token?: { value: string; expires: number };
  enabled() {
    return !!(
      process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.PAYPAL_WEBHOOK_ID
    );
  }
  private base() {
    if (!this.enabled() || process.env.PAYPAL_BASE_URL !== 'https://api-m.sandbox.paypal.com')
      throw new ServiceUnavailableException(
        'PayPal Sandbox is not configured. Production endpoints are disabled.',
      );
    return 'https://api-m.sandbox.paypal.com';
  }
  async accessToken() {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    const response = await fetch(`${this.base()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
          ).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    }).catch(() => {
      throw new ProviderError(false);
    });
    if (!response.ok) throw await providerFailure(response, false);
    const parsed = await response
      .json()
      .then((body: unknown) =>
        z.object({ access_token: z.string(), expires_in: z.number().positive() }).parse(body),
      )
      .catch(() => {
        throw new ProviderError(false);
      });
    this.token = {
      value: parsed.access_token,
      expires: Date.now() + Math.max(0, Math.min(parsed.expires_in, 3600) - 60) * 1000,
    };
    return parsed.access_token;
  }
  async request(path: string, method: string, body?: unknown, key?: string): Promise<unknown> {
    const token = await this.accessToken();
    const response = await fetch(this.base() + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        Prefer: 'return=representation',
        ...(key ? { 'PayPal-Request-Id': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    }).catch(() => {
      throw new ProviderError(method === 'POST');
    });
    if (!response.ok)
      throw await providerFailure(
        response,
        method === 'POST' &&
          (response.status >= 500 || response.status === 429 || response.status === 422),
      );
    const text = await response.text().catch(() => {
      throw new ProviderError(method === 'POST');
    });
    if (text.length > 1024 * 1024) throw new ProviderError(method === 'POST');
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderError(method === 'POST');
    }
  }
  async createOrder(id: string, minor: string, currency: string, key: string, pactId?: string) {
    const origin = process.env.WEB_ORIGIN!;
    return orderSchema.parse(
      await this.request(
        '/v2/checkout/orders',
        'POST',
        {
          intent: 'CAPTURE',
          purchase_units: [
            { custom_id: id, amount: { currency_code: currency, value: decimalAmount(minor) } },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: `${origin}/workspace/payment-return?pact=${encodeURIComponent(pactId ?? '')}`,
                cancel_url: `${origin}/workspace`,
                user_action: 'PAY_NOW',
              },
            },
          },
        },
        key,
      ),
    );
  }
  async capture(id: string, key: string) {
    return orderSchema.parse(
      await this.request(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, 'POST', {}, key),
    );
  }
  async refund(id: string, minor: string, currency: string, key: string) {
    return resourceSchema.parse(
      await this.request(
        `/v2/payments/captures/${encodeURIComponent(id)}/refund`,
        'POST',
        { amount: { currency_code: currency, value: decimalAmount(minor) } },
        key,
      ),
    );
  }
  async getOrder(id: string) {
    const parsed = orderSchema.safeParse(
      await this.request(`/v2/checkout/orders/${encodeURIComponent(id)}`, 'GET'),
    );
    if (!parsed.success) throw new ProviderError(false, { name: 'INVALID_PROVIDER_RESPONSE' });
    return parsed.data;
  }
  async getCapture(id: string) {
    return resourceSchema.parse(
      await this.request(`/v2/payments/captures/${encodeURIComponent(id)}`, 'GET'),
    );
  }
  async getRefund(id: string) {
    return resourceSchema.parse(
      await this.request(`/v2/payments/refunds/${encodeURIComponent(id)}`, 'GET'),
    );
  }
  async verify(headers: Record<string, string>, event: unknown) {
    const cert = headers['paypal-cert-url'];
    if (
      !cert ||
      !/^https:\/\/api(?:\.sandbox)?\.paypal\.com\/v1\/notifications\/certs\/[A-Za-z0-9_-]+$/.test(
        cert,
      ) ||
      headers['paypal-auth-algo'] !== 'SHA256withRSA'
    )
      return false;
    const result = z.object({ verification_status: z.string() }).parse(
      await this.request('/v1/notifications/verify-webhook-signature', 'POST', {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: cert,
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      }),
    );
    return result.verification_status === 'SUCCESS';
  }
}
