import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import {
  REDIS_CLIENT,
  REDIS_PUBLISHER,
  REDIS_SUBSCRIBER,
} from "./redis.constants";

const logger = new Logger("Redis");

const makeClient = (config: ConfigService): Redis => {
  const client = new Redis(config.getOrThrow<string>("redisUrl"), {
    maxRetriesPerRequest: 3,
  });
  // без слушателя 'error' ioredis печатает сырые стектрейсы в stderr мимо pino.
  // Маршрутизируем через Nest-логгер; переподключением ioredis занимается сам.
  client.on("error", (e: Error) => logger.warn(`redis client error: ${e.message}`));
  return client;
};

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, inject: [ConfigService], useFactory: makeClient },
    // pub/sub требует ОТДЕЛЬНЫХ коннектов: подписанный коннект Redis не может
    // выполнять обычные команды (ограничение протокола). Заведены на будущее —
    // RedisPubSub в PubSubModule держит собственную пару коннектов.
    { provide: REDIS_PUBLISHER, inject: [ConfigService], useFactory: makeClient },
    { provide: REDIS_SUBSCRIBER, inject: [ConfigService], useFactory: makeClient },
  ],
  exports: [REDIS_CLIENT, REDIS_PUBLISHER, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_PUBLISHER) private readonly pub: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly sub: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    // graceful shutdown: закрываем коннекты (работает с enableShutdownHooks)
    await Promise.allSettled([
      this.client.quit(),
      this.pub.quit(),
      this.sub.quit(),
    ]);
  }
}
