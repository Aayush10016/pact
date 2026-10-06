import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const response = host.switchToHttp().getResponse<ServerResponse>();
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        error: {
          code: status,
          message:
            status >= 500
              ? 'This service is not available yet.'
              : exception instanceof HttpException
                ? exception.message
                : 'Request failed.',
        },
      }),
    );
  }
}
