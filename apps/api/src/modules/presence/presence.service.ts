import { Inject, Injectable, Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { REDIS_CLIENT } from "../../redis/redis.constants";
import { PUB_SUB } from "../../pubsub/pubsub.module";

// Атомарный decr + условный del в одном серверном шаге: ключ удаляется ТОЛЬКО когда
// счётчик дошёл до 0. Иначе торчит окно между DECR и DEL, в которое параллельный
// connect (INCR другой вкладки) восстановит ключ, а наш DEL его снесёт — и живой
// пользователь окажется «оффлайн». Возвращаем 1, если перешли в оффлайн.
const DISCONNECT_LUA = `
local c = redis.call('DECR', KEYS[1])
if c <= 0 then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0`;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  async connected(userId: string): Promise<void> {
    // best-effort: сбой Redis на presence НЕ должен ронять WS-соединение
    // (и не должен оставить onConnect неподтверждённым — иначе onDisconnect не
    // вызовется и счётчик «зависнет»). Глушим и логируем.
    try {
      const count = await this.redis.incr(`presence:${userId}`);
      if (count === 1) {
        // переход offline → online: уведомляем один раз
        await this.pubsub.publish("presenceChanged", {
          presenceChanged: { userId, online: true },
        });
      }
    } catch (e) {
      this.logger.warn(
        `presence connect failed for ${userId}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async disconnected(userId: string): Promise<void> {
    // КРИТИЧНО: onDisconnect у graphql-ws вызывается fire-and-forget (промис не
    // await'ится и без .catch()). Необработанный reject здесь = unhandledRejection,
    // а с дефолтной политикой Node это падение ВСЕГО процесса. Поэтому fail-safe.
    try {
      const wentOffline = (await this.redis.eval(
        DISCONNECT_LUA,
        1,
        `presence:${userId}`,
      )) as number;
      if (wentOffline === 1) {
        await this.pubsub.publish("presenceChanged", {
          presenceChanged: { userId, online: false },
        });
      }
    } catch (e) {
      this.logger.warn(
        `presence disconnect failed for ${userId}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async isOnline(userId: string): Promise<boolean> {
    try {
      return (await this.redis.exists(`presence:${userId}`)) === 1;
    } catch {
      return false; // fail-safe
    }
  }
}
