import { Logger as NestLogger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { graphqlUploadExpress } from "graphql-upload-minimal";
import { Logger } from "nestjs-pino";
import { join } from "node:path";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

// Защитная сетка: наличие обработчика не даёт Node убить процесс при «потерянном»
// reject (например, в fire-and-forget колбэках graphql-ws). Корневые причины чиним
// fail-safe в коде, но один зависший промис не должен ронять весь инстанс.
process.on("unhandledRejection", (reason) => {
  NestLogger.error(
    `Unhandled promise rejection: ${
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
    }`,
    "UnhandledRejection",
  );
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Pino становится логгером всего приложения.
  // bufferLogs: true копит ранние логи и сбрасывает их сюда, когда логгер готов.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const isProd = config.get<string>("nodeEnv") === "production";

  // dev: рефлексируем любой origin (удобно для локального фронта/Sandbox).
  // prod: только явный allowlist из CLIENT_ORIGIN (иначе CORS закрыт).
  const clientOrigin = config.get<string>("cors.origin");
  const corsOrigin: boolean | string[] = isProd
    ? clientOrigin
      ? clientOrigin.split(",").map((o) => o.trim())
      : false
    : true;

  // helmet / cors / cookie-parser / ValidationPipe — общая настройка с тестами
  configureApp(app, isProd, corsOrigin);

  // multipart-загрузки (спека GraphQL multipart request) парсятся ДО GraphQL:
  // middleware вешаем только на /graphql, лимиты — от decompression-мусора
  app.use(
    "/graphql",
    graphqlUploadExpress({ maxFileSize: 15 * 1024 * 1024, maxFiles: 1 }),
  );
  // загруженные файлы и их webp-производные раздаются как есть из storage/
  app.useStaticAssets(join(process.cwd(), "storage"), { prefix: "/static/" });

  // Активирует OnApplicationShutdown / OnModuleDestroy по SIGINT/SIGTERM (только рантайм)
  app.enableShutdownHooks();

  const port = config.get<number>("port", 3000);
  await app.listen(port);
}

void bootstrap();
