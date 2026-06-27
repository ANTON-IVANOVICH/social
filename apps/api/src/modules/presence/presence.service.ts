import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { REDIS_CLIENT } from "../../redis/redis.constants";
import { PUB_SUB } from "../../pubsub/pubsub.module";

// Сердцебиение presence. graphql-ws на уровне WS уже пингует клиента (~12с) и
// рвёт зависший сокет → onDisconnect освобождает счётчик. Но при ЖЁСТКОЙ смерти
// процесса (OOM/SIGKILL) onDisconnect не вызовется, и без TTL счётчик завис бы в
// «онлайн» навсегда. Поэтому ключу выставляется TTL, а живые соединения этого
// инстанса периодически продлевают его. Умер процесс — интервал встал — TTL
// истёк — presence сам очистился.
const PRESENCE_TTL_S = 60;
const HEARTBEAT_MS = 25_000; // < PRESENCE_TTL_S, с запасом на джиттер

// connect: INCR + EXPIRE одним атомарным шагом (без окна, где ключ без TTL)
const CONNECT_LUA = `
local c = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return c`;

// disconnect: атомарный DECR + условный DEL. Ключ удаляется ТОЛЬКО когда счётчик
// дошёл до 0 — иначе параллельный connect (INCR другой вкладки) восстановил бы
// ключ, а наш DEL снёс бы его и живой пользователь стал бы «оффлайн».
const DISCONNECT_LUA = `
local c = redis.call('DECR', KEYS[1])
if c <= 0 then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0`;

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  // userId → число живых соединений на ЭТОМ инстансе (для продления TTL)
  private readonly local = new Map<string, number>();
  private heartbeat?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  onModuleInit(): void {
    this.heartbeat = setInterval(() => void this.refreshLocal(), HEARTBEAT_MS);
    // не держим event loop живым ради одного таймера (важно для тестов/shutdown)
    this.heartbeat.unref?.();
  }

  onModuleDestroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  async connected(userId: string): Promise<void> {
    // локальный учёт ведём всегда (даже если Redis мигнул) — это «кого продлевать»
    this.local.set(userId, (this.local.get(userId) ?? 0) + 1);
    // best-effort: сбой Redis на presence НЕ должен ронять WS-соединение
    try {
      const count = (await this.redis.eval(
        CONNECT_LUA,
        1,
        `presence:${userId}`,
        String(PRESENCE_TTL_S),
      )) as number;
      if (count === 1) {
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
    const next = (this.local.get(userId) ?? 0) - 1;
    if (next <= 0) this.local.delete(userId);
    else this.local.set(userId, next);
    // КРИТИЧНО: onDisconnect у graphql-ws — fire-and-forget; необработанный reject
    // здесь = unhandledRejection и падение всего процесса. Поэтому fail-safe.
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

  // продлеваем TTL для пользователей с живым соединением на этом инстансе
  private async refreshLocal(): Promise<void> {
    if (this.local.size === 0) return;
    try {
      const pipe = this.redis.pipeline();
      for (const userId of this.local.keys()) {
        pipe.expire(`presence:${userId}`, PRESENCE_TTL_S);
      }
      await pipe.exec();
    } catch (e) {
      this.logger.warn(
        `presence heartbeat failed: ${e instanceof Error ? e.message : e}`,
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
