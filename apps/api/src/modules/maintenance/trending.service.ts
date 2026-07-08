import { Inject, Injectable } from "@nestjs/common";
import { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.constants";
import { PrismaService } from "../../prisma/prisma.service";

const TRENDING_KEY = "trending:hashtags";
const TRENDING_TTL = 2 * 60 * 60; // 2 часа (сек) — переживает окно между пересчётами

export interface TrendingRow {
  tag: string;
  count: number;
}

// Тренды кешируем в Redis: тяжёлый JOIN считается раз в 30 минут планировщиком, а
// запросы раздаются из кэша. Redis-клиент используем напрямую (без cache-manager) —
// он уже подключён (REDIS_CLIENT), меньше зависимостей и версионных нюансов.
@Injectable()
export class TrendingService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  async recompute(): Promise<void> {
    // топ хэштегов за 24ч — сырой SQL с JOIN (groupBy Prisma тут неудобен).
    // BigInt из COUNT приводим к int на стороне БД (::int), чтобы JSON не ломался.
    const top = await this.prisma.$queryRaw<TrendingRow[]>`
      SELECT h.tag, COUNT(*)::int AS count
      FROM post_hashtags ph
      JOIN posts p    ON p.id = ph."postId"
      JOIN hashtags h ON h.id = ph."hashtagId"
      WHERE p."createdAt" > NOW() - INTERVAL '24 hours'
      GROUP BY h.tag
      ORDER BY count DESC
      LIMIT 10
    `;
    await this.redis.set(TRENDING_KEY, JSON.stringify(top), "EX", TRENDING_TTL);
  }

  async getTrending(): Promise<TrendingRow[]> {
    const cached = await this.redis.get(TRENDING_KEY);
    if (cached) return JSON.parse(cached) as TrendingRow[];
    // промах кэша (первый запрос / истёк TTL) → пересчитать на лету
    await this.recompute();
    const fresh = await this.redis.get(TRENDING_KEY);
    return fresh ? (JSON.parse(fresh) as TrendingRow[]) : [];
  }
}
