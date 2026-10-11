import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import { CheckoutUnavailableError, ProviderError } from '../payments/paypal.provider';
import type { ServerResponse } from 'node:http';
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const provider = exception instanceof ProviderError;
    const unavailableOrder = exception instanceof CheckoutUnavailableError;
    const status = provider
      ? unavailableOrder
        ? 409
        : 503
      : exception instanceof HttpException
        ? exception.getStatus()
        : 500;
    if (provider)
      new Logger('PayPal').warn(
        JSON.stringify({ ...exception.diagnostic, uncertain: exception.uncertain }),
      );
    const response = host.switchToHttp().getResponse<ServerResponse>();
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        error: {
          code: status,
          ...(unavailableOrder ? { reason: 'PAYPAL_ORDER_UNAVAILABLE' } : {}),
          message: provider
            ? exception.userMessage
            : status >= 500
              ? 'The server could not complete this request. Refresh the record to check its status before retrying. No payment or refund is confirmed by this error.'
              : exception instanceof HttpException
                ? exception.message
                : 'Request failed.',
        },
      }),
    );
  }
}
