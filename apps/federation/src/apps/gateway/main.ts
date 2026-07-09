import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { GATEWAY_HOST, PORTS } from "../../libs/common/env";
import { GatewayModule } from "./gateway.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(GatewayModule);

  // Паритет с монолитом: origin не рефлексируем безусловно. В проде — только
  // allowlist из CLIENT_ORIGIN, иначе любой сайт слал бы credentialed-запросы.
  const isProd = process.env.NODE_ENV === "production";
  const clientOrigin = process.env.CLIENT_ORIGIN;
  const origin: boolean | string[] = isProd
    ? clientOrigin
      ? clientOrigin.split(",").map((o) => o.trim())
      : false
    : true;
  app.enableCors({ origin, credentials: true });

  app.enableShutdownHooks();
  await app.listen(PORTS.gateway, GATEWAY_HOST);
  new Logger("Gateway").log(
    `supergraph → http://localhost:${PORTS.gateway}/graphql`,
  );
}

void bootstrap();
