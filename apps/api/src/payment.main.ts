import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { json, raw, urlencoded } from 'express';
import { PaymentPublicModule } from './payment/payment-public.module';
import { GlobalExceptionFilter } from './common/filters/business-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LocalizedConsoleLogger } from './common/logger/localized-console.logger';
import { TRACE_ID_HEADER } from './common/request-trace';

type RequestWithRawBody = Request & { rawBody?: string };

async function bootstrap() {
  const app = await NestFactory.create(PaymentPublicModule, {
    bodyParser: false,
    logger: new LocalizedConsoleLogger(),
  });

  const captureRawBody = (req: RequestWithRawBody, _res: Response, buf: Buffer, encoding: BufferEncoding) => {
    if (buf.length > 0) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  };

  app.use('/api/payment/webhook/lakala', raw({ type: '*/*', verify: captureRawBody, limit: '256kb' }));
  app.use(json());
  app.use(urlencoded({ extended: true }));

  const configService = app.get(ConfigService);
  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [];
  const port = Number.parseInt(process.env.PAYMENT_PORT ?? '3001', 10);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.enableCors({
    origin: (origin, callback) => {
      const isLocalhost = !origin || origin.includes('localhost') || origin.includes('127.0.0.1');
      if (isLocalhost || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('不允许的 CORS 跨域请求: ' + origin), false);
      }
    },
    credentials: true,
    exposedHeaders: [TRACE_ID_HEADER],
  });

  const config = new DocumentBuilder()
    .setTitle('收单吧 H5 支付 API')
    .setDescription('H5 公开支付与拉卡拉 Webhook 回调接口')
    .setVersion('1.0.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  await app.listen(port);

  const shutdown = async (signal: string) => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
