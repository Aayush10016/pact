import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { requestContext } from './common/request-context';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConsoleLogger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { readConfig } from './config';
import { HttpErrorFilter } from './common/http-error.filter';
async function bootstrap() {
  const config = readConfig();
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ context: 'Pact', json: true }),
    bodyParser: true,
  });
  app.use(helmet());
  const requests = new ConsoleLogger({ context: 'PactRequests', json: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    if (req.path.startsWith('/v1/')) res.setHeader('Cache-Control', 'private, no-store');
    requestContext.run({ requestId }, () => {
      res.once('finish', () =>
        requests.log({
          event: 'HTTP_COMPLETE',
          ...requestContext.getStore(),
          method: req.method,
          status: res.statusCode,
        }),
      );
      next();
    });
  });
  app.enableCors({ origin: config.WEB_ORIGIN, methods: ['GET', 'POST'], credentials: false });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, '0.0.0.0');
}
bootstrap().catch(() => {
  process.stderr.write('Pact API failed to start. Check configuration.\n');
  process.exitCode = 1;
});
