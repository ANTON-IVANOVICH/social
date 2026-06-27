import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { Redis } from "ioredis";

export const PUB_SUB = "PUB_SUB";

const pubsubLogger = new Logger("RedisPubSub");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

// payload подписки едет через Redis как JSON → Date становится ISO-строкой. Без
// этого DateTime-скаляр (serialize: value instanceof Date ? toISOString() : null)
// вернёт null на НЕ-nullable createdAt и убьёт доставку события. Возвращаем Date
// обратно — но только для полей-дат (ключ оканчивается на "At"), чтобы случайная
// строка-таймстемп в обычном поле (например content) не превратилась в Date.
const reviver = (key: string, value: unknown): unknown =>
  typeof value === "string" && key.endsWith("At") && ISO_DATE.test(value)
    ? new Date(value)
    : value;

@Global()
@Module({
  providers: [
    {
      provide: PUB_SUB,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>("redisUrl");
        // RedisPubSub держит собственную пару publisher/subscriber коннектов —
        // так инкапсуляция чище, чем переиспользовать REDIS_PUBLISHER/SUBSCRIBER.
        const mk = () => {
          const c = new Redis(url);
          c.on("error", (e: Error) =>
            pubsubLogger.warn(`pubsub redis error: ${e.message}`),
          );
          return c;
        };
        return new RedisPubSub({
          publisher: mk(),
          subscriber: mk(),
          reviver,
        });
      },
    },
  ],
  exports: [PUB_SUB],
})
export class PubSubModule implements OnApplicationShutdown {
  constructor(@Inject(PUB_SUB) private readonly pubsub: RedisPubSub) {}

  async onApplicationShutdown(): Promise<void> {
    // закрываем оба коннекта RedisPubSub при остановке приложения
    await this.pubsub.close();
  }
}
