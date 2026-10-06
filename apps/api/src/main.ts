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
  app.enableCors({ origin: config.WEB_ORIGIN, methods: ['GET', 'POST'], credentials: false });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, '0.0.0.0');
}
bootstrap().catch(() => {
  process.stderr.write('Pact API failed to start. Check configuration.\n');
  process.exitCode = 1;
});
