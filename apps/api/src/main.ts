import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

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

  // Активирует OnApplicationShutdown / OnModuleDestroy по SIGINT/SIGTERM (только рантайм)
  app.enableShutdownHooks();

  const port = config.get<number>("port", 3000);
  await app.listen(port);
}

void bootstrap();
