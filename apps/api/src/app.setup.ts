import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";

// Общая конфигурация приложения (helmet/cors/cookies/pipes). Используется и в
// main.ts (рантайм), и в e2e-тестах — чтобы тестовое приложение вело себя как прод.
export function configureApp(
  app: INestApplication,
  isProd: boolean,
  corsOrigin: boolean | string | string[],
): void {
  // CSP отключаем только в dev — иначе не грузится Apollo Sandbox (inline-скрипты).
  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
  // origin не рефлексируем безусловно: в проде — только allowlist (CLIENT_ORIGIN),
  // иначе любой сайт мог бы слать credentialed-запросы.
  app.enableCors({ origin: corsOrigin, credentials: true });
  // req.cookies — чтобы читать refresh-токен из httpOnly-cookie
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
}
