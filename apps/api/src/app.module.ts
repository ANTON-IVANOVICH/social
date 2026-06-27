import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { LoggerModule } from "nestjs-pino";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import configuration from "./config/configuration";
import { validate } from "./config/env.validation";
import { LifecycleService } from "./common/lifecycle.service";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { depthLimit } from "./common/graphql/depth-limit";
import { DataLoaderModule } from "./common/dataloader/dataloader.module";
import { DataLoaderService } from "./common/dataloader/dataloader.service";
import { REDIS_CLIENT } from "./redis/redis.constants";
import { RedisModule } from "./redis/redis.module";
import { PubSubModule } from "./pubsub/pubsub.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { UsersModule } from "./modules/users/users.module";
import { PostsModule } from "./modules/posts/posts.module";
import { ReactionsModule } from "./modules/reactions/reactions.module";
import { CommentsModule } from "./modules/comments/comments.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { FeedModule } from "./modules/feed/feed.module";
import { PresenceModule } from "./modules/presence/presence.module";
import {
  SubscriptionContextService,
  SubscriptionExtra,
} from "./modules/presence/subscription-context.service";

// graphql-ws передаёт авторизацию в connectionParams, а извлечённого пользователя
// мы кладём в extra. HTTP-контекст Apollo несёт { req, res } и поля extra не имеет —
// по его наличию и различаем подписку поверх WS от обычного запроса.
interface ApolloContext {
  req?: unknown;
  res?: unknown;
  extra?: SubscriptionExtra;
}

// graphql-ws типизирует Context.extra как unknown (generic не связан на этом уровне),
// поэтому для onConnect/onDisconnect берём свободный тип и приводим extra вручную.
interface GraphqlWsContext {
  connectionParams?: Record<string, unknown>;
  extra?: unknown;
}

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

    // ── инфраструктура реального времени ──
    RedisModule, // @Global: REDIS_CLIENT + пара pub/sub
    PubSubModule, // @Global: PUB_SUB (RedisPubSub) для подписок между инстансами

    // GraphQL — code-first, драйвер Apollo
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      // PresenceModule экспортирует SubscriptionContextService для onConnect/onDisconnect
      imports: [DataLoaderModule, PresenceModule],
      inject: [ConfigService, DataLoaderService, SubscriptionContextService],
      useFactory: (
        config: ConfigService,
        dataLoader: DataLoaderService,
        subCtx: SubscriptionContextService,
      ) => {
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
          // заготовка под лимиты запросов: глубина сейчас, стоимость — позже
          validationRules: [depthLimit(maxDepth)],

          // Подписки поверх graphql-ws. Аутентификация — ОДИН раз при установке
          // соединения (onConnect), а не на каждой операции: браузерный WebSocket
          // не умеет ставить заголовки на handshake → токен едет в connectionParams.
          subscriptions: {
            "graphql-ws": {
              // сокет, открывший WS, но не приславший ConnectionInit за это время,
              // закрывается — не держим «полуоткрытые» соединения. Сам keepAlive
              // (WS-пинг ~12с с terminate) graphql-ws держит включённым по умолчанию
              // и рвёт зависшие коннекты → onDisconnect освобождает presence.
              connectionInitWaitTimeout: 10_000,
              onConnect: (context: GraphqlWsContext) => {
                // graphql-ws всегда кладёт extra ({ socket, request }); мы дополняем
                // его user/followingIds. ?? на случай отсутствия — чтобы не потерять ссылку.
                const extra = (context.extra ??= {}) as SubscriptionExtra;
                return subCtx.onConnect(extra, context.connectionParams ?? {});
              },
              onDisconnect: (context: GraphqlWsContext) =>
                subCtx.onDisconnect((context.extra ?? {}) as SubscriptionExtra),
            },
          },

          // Единый context для HTTP и WS: подписку различаем по наличию extra.
          // В обоих случаях кладём req.user → @CurrentUser работает одинаково,
          // и свежие per-request лоадеры доступны в т.ч. в полях подписок.
          context: (ctx: ApolloContext) => {
            const loaders = dataLoader.createLoaders();
            if (ctx.extra) {
              return {
                req: { user: ctx.extra.user },
                followingIds: ctx.extra.followingIds,
                loaders,
              };
            }
            return { req: ctx.req, res: ctx.res, loaders };
          },

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

    // дефолтные лимиты на shared-хранилище Redis: на нескольких инстансах лимит
    // считается общим, а не каждым процессом отдельно. Точечно строже — через @Throttle.
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        // передаём ОБЩИЙ клиент: storage не владеет его жизненным циклом
        // (disconnect делает RedisModule), поэтому двойного закрытия нет
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),

    // ── доменное ядро ──
    PrismaModule,
    AuthModule, // ── аутентификация ──
    UsersModule,
    PostsModule,
    ReactionsModule,
    CommentsModule,
    NotificationsModule,
    FeedModule,
    PresenceModule, // ── presence + typing + аутентификация подписок ──
    // DataLoaderModule отдельно тащить не нужно — он импортируется внутри GraphQLModule
  ],
  providers: [
    LifecycleService,
    // Глобальный exception-фильтр (GraphQL + REST), DI через APP_FILTER
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Тайминги корневых GraphQL-операций (Query/Mutation/Subscription)
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
