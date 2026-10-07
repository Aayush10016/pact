import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import { ProviderError } from '../payments/paypal.provider';
import type { ServerResponse } from 'node:http';
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const provider = exception instanceof ProviderError;
    const status = provider
      ? 503
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
          message: provider
            ? exception.userMessage
            : status >= 500
              ? 'This service is not available yet.'
              : exception instanceof HttpException
                ? exception.message
                : 'Request failed.',
        },
      }),
    );
  }
}
