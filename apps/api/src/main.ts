import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { json, raw, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/business-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { IMPORT_PREVIEW_BODY_LIMIT, PRINTING_CONFIG_BODY_LIMIT } from './import/import.constants';

type RequestWithRawBody = Request & { rawBody?: string };

async function bootstrap() {
  // 关闭 Nest 默认 body parser，改按路由分档挂 express 中间件
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const captureRawBody = (req: RequestWithRawBody, _res: Response, buf: Buffer, encoding: BufferEncoding) => {
    if (buf.length > 0) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  };

  // Webhook 统一按原始字节流接收，避免第三方回调因 content-type 差异在 controller 前被拦截
  app.use('/api/payment/webhook/lakala', raw({ type: '*/*', verify: captureRawBody, limit: '256kb' }));
  // 大 body 例外：导入预检
  app.use('/api/import/preview', json({ limit: IMPORT_PREVIEW_BODY_LIMIT }));
  // 中 body 例外：打印模板配置（前缀匹配，GET 无 body 不受影响）
  app.use('/api/settings/printing', json({ limit: PRINTING_CONFIG_BODY_LIMIT }));
  // 其他所有路由：沿用 Express 原厂默认 100KB
  app.use(json());
  app.use(urlencoded({ extended: true }));

  const configService = app.get(ConfigService);
  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [];
  const port = configService.get<number>('app.port') ?? 3000;

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
  });

  // 2. 配置 Swagger 在线接口文档
  const config = new DocumentBuilder()
    .setTitle('收单吧 API 文档')
    .setDescription('在线接口文档，前后端联调契约规范')
    .setVersion('1.0.0')
    .addBearerAuth() // 开启全局 JWT Token 传递功能
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json', // 提供给前端的一键拉取生成 JSON 端点
  });

  await app.listen(port);
}
bootstrap();
