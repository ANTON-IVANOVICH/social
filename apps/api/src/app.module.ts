import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import configuration from "./config/configuration";
import { validate } from "./config/env.validation";
import { LifecycleService } from "./common/lifecycle.service";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { depthLimit } from "./common/graphql/depth-limit";
import { DataLoaderModule } from "./common/dataloader/dataloader.module";
import { DataLoaderService } from "./common/dataloader/dataloader.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { UsersModule } from "./modules/users/users.module";
import { PostsModule } from "./modules/posts/posts.module";
import { ReactionsModule } from "./modules/reactions/reactions.module";
import { CommentsModule } from "./modules/comments/comments.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { FeedModule } from "./modules/feed/feed.module";

@Module({
  imports: [
    // Конфигурация: глобальный модуль, валидация env + структурированный доступ
    ConfigModule.forRoot({
      isGlobal: true, // ConfigService доступен во всех модулях без повторного импорта
      validate, // привратник: падаем при битом env
      load: [configuration], // удобный типизированный доступ через config.get('port')
    }),

    // Структурное логирование через Pino
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>("logLevel"),
          // Каждый запрос получает reqId; все логи внутри него тегируются этим ID
          genReqId: (req) =>
            (req.headers["x-request-id"] as string) ?? randomUUID(),
          // pino-pretty — только в dev. В проде нужны сырые JSON-логи для агрегаторов
          transport:
            config.get<string>("nodeEnv") === "development"
              ? {
                  target: "pino-pretty",
                  options: {
                    translateTime: "HH:MM:ss Z",
                    ignore: "pid,hostname",
                    colorize: true,
                  },
                }
              : undefined,
        },
      }),
    }),

    // GraphQL — code-first, драйвер Apollo
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [DataLoaderModule],
      inject: [ConfigService, DataLoaderService],
      useFactory: (config: ConfigService, dataLoader: DataLoaderService) => {
        const isProd = config.get<string>("nodeEnv") === "production";
        const maxDepth = config.get<number>("graphql.maxDepth", 12);
        return {
          // схема генерируется ИЗ кода (декораторов) в этот файл
          autoSchemaFile: join(process.cwd(), "src/schema.gql"),
          sortSchema: true,
          playground: false, // старый playground выключен
          // в проде не раскрываем схему: интроспекция и Sandbox выключены
          introspection: !isProd,
          plugins: [
            isProd
              ? ApolloServerPluginLandingPageDisabled()
              : ApolloServerPluginLandingPageLocalDefault(), // современный Apollo Sandbox
          ],
          // заготовка под лимиты запросов: глубина сейчас, стоимость — на прод-этапе
          validationRules: [depthLimit(maxDepth)],
          // context вызывается на каждый запрос → свежие per-request лоадеры.
          // Спредим ctx ({ req, res }) — req понадобится auth-слою на этапе 3.
          context: (ctx: object) => ({
            ...ctx,
            loaders: dataLoader.createLoaders(),
          }),
          formatError: (err) => {
            const code = err.extensions?.code as string | undefined;
            // defense-in-depth: ошибки, прошедшие мимо exception-фильтра (фаза
            // parse/validate), в проде не раскрываем, если это внутренний сбой
            const message =
              isProd && (!code || code === "INTERNAL_SERVER_ERROR")
                ? "Internal server error"
                : err.message;
            return {
              message,
              code,
              path: err.path,
              // паритет с REST-веткой фильтра: отдаём детали валидации
              ...(err.extensions?.details
                ? { details: err.extensions.details }
                : {}),
            };
          },
        };
      },
    }),

    HealthModule,

    // дефолтные лимиты (ttl в миллисекундах); точечные строже через @Throttle
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // ── доменное ядро (Этап 2) ──
    PrismaModule,
    AuthModule, // ── аутентификация (Этап 3) ──
    UsersModule,
    PostsModule,
    ReactionsModule,
    CommentsModule,
    NotificationsModule,
    FeedModule,
    // DataLoaderModule отдельно тащить не нужно — он импортируется внутри GraphQLModule
  ],
  providers: [
    LifecycleService,
    // Глобальный exception-фильтр (GraphQL + REST), DI через APP_FILTER
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
