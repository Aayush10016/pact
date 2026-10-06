import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
  constructor(readonly uncertain: boolean) {
    super('Payment provider unavailable');
  }
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
          amount: z.object({ currency_code: z.string(), value: z.string() }),
          payments: z.object({ captures: z.array(resourceSchema).optional() }).optional(),
        }),
      )
      .optional(),
    links: z.array(z.object({ href: z.url(), rel: z.string() })).optional(),
  })
  .passthrough();
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
    if (!response.ok) throw new ProviderError(false);
    const parsed = z
      .object({ access_token: z.string(), expires_in: z.number().positive() })
      .parse(await response.json());
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
        ...(key ? { 'PayPal-Request-Id': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    }).catch(() => {
      throw new ProviderError(method === 'POST');
    });
    if (!response.ok)
      throw new ProviderError(
        method === 'POST' && (response.status >= 500 || response.status === 429),
      );
    const text = await response.text();
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
    return orderSchema.parse(
      await this.request(`/v2/checkout/orders/${encodeURIComponent(id)}`, 'GET'),
    );
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
