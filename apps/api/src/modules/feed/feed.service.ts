import { Inject, Injectable } from "@nestjs/common";
import { Post } from "@prisma/client";
import { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.constants";
import { PrismaService } from "../../prisma/prisma.service";
import {
  type FeedCursor,
  encodeFeedCursor,
  decodeFeedCursor,
} from "../../common/cursor/cursor.util";

const MAX_FEED = 800; // храним только хвост ленты в Redis; глубже — из БД
const FEED_TTL = 60 * 60 * 24 * 14; // 14 дней неактивности → лента истекает

export interface FeedPage {
  items: Post[];
  nextCursor: string | null;
}

// Гибридная лента (fan-out on write):
// • ПЕРВАЯ страница — O(1) из материализованного Redis sorted set feed:<userId>
//   (score = время поста в мс; порядок score desc, member/id desc совпадает с
//   БД-порядком createdAt desc, id desc, т.к. createdAt хранится с мс-точностью);
// • СЛЕДУЮЩИЕ страницы и промах — keyset-пагинация по БД (createdAt,id). Это чинит
//   тупики (хвост > 800 / пустой набор) и пропуск постов с одинаковой мс: у Redis
//   нет DB-фолбэка при курсоре, а score-курсор без id-tiebreak терял ties.
@Injectable()
export class FeedService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  private key(userId: string) {
    return `feed:${userId}`;
  }

  // ЗАПИСЬ (fan-out): дописать пост в ленты подписчиков; score = время поста
  async pushToFeeds(
    followerIds: string[],
    postId: string,
    createdAt: Date,
  ): Promise<void> {
    if (followerIds.length === 0) return;
    const score = createdAt.getTime();
    const pipe = this.redis.pipeline();
    for (const id of followerIds) {
      const key = this.key(id);
      pipe.zadd(key, score, postId);
      pipe.zremrangebyrank(key, 0, -(MAX_FEED + 1)); // обрезаем до MAX_FEED свежих
      pipe.expire(key, FEED_TTL);
    }
    await pipe.exec();
  }

  // сбросить материализованную ленту (напр. при unfollow) — пересоберётся из БД
  // на следующем чтении с актуальным графом подписок
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }

  async readFeed(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<FeedPage> {
    // page 2+ — всегда из БД keyset (набор Redis хранит лишь хвост в 800 и не
    // умеет отдать старое; курсор гарантирует корректную границу с id-tiebreak)
    if (cursor) {
      const decoded = decodeFeedCursor(cursor);
      return this.pageFromDb(userId, limit, decoded);
    }

    // page 1 — быстрый путь из материализованного набора
    const raw = await this.redis.zrevrange(
      this.key(userId),
      0,
      limit - 1,
      "WITHSCORES",
    );
    if (raw.length > 0) {
      const ids: string[] = [];
      for (let i = 0; i < raw.length; i += 2) ids.push(raw[i]);
      const posts = await this.hydrate(ids);
      if (posts.length > 0) {
        const last = posts[posts.length - 1];
        // курсор есть, только если набор отдал полный лимит (иначе конец хвоста —
        // но глубже мог быть DB-хвост, поэтому курсор ставим и на границе лимита)
        const nextCursor =
          posts.length >= limit
            ? encodeFeedCursor(last.createdAt, last.id)
            : null;
        return { items: posts, nextCursor };
      }
    }

    // набор пуст (новый юзер / истёк TTL) → собрать из БД и материализовать
    return this.pageFromDb(userId, limit, null, /* materialize */ true);
  }

  // гидрация постов по id с сохранением порядка (findMany порядок не хранит);
  // отсутствующие (удалённые) молча выпадают
  private async hydrate(ids: string[]): Promise<Post[]> {
    const posts = await this.prisma.post.findMany({ where: { id: { in: ids } } });
    const byId = new Map(posts.map((p) => [p.id, p]));
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is Post => p !== undefined);
  }

  // keyset-пагинация по БД: посты подписок + свои, (createdAt,id) < курсора.
  // materialize=true (только для page 1 без курсора) заполняет Redis на будущее.
  private async pageFromDb(
    userId: string,
    limit: number,
    cursor: FeedCursor | null,
    materialize = false,
  ): Promise<FeedPage> {
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const authorIds = [...following.map((f) => f.followingId), userId]; // + свои

    const posts = await this.prisma.post.findMany({
      where: {
        authorId: { in: authorIds },
        ...(cursor
          ? {
              // (createdAt,id) строго меньше курсора — стабильный keyset с тай-брейком
              OR: [
                { createdAt: { lt: new Date(cursor.ms) } },
                {
                  createdAt: new Date(cursor.ms),
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });

    if (materialize && posts.length > 0) {
      const pipe = this.redis.pipeline();
      const feedKey = this.key(userId);
      for (const p of posts) pipe.zadd(feedKey, p.createdAt.getTime(), p.id);
      pipe.zremrangebyrank(feedKey, 0, -(MAX_FEED + 1));
      pipe.expire(feedKey, FEED_TTL);
      await pipe.exec();
    }

    const last = posts[posts.length - 1];
    const nextCursor =
      posts.length >= limit ? encodeFeedCursor(last.createdAt, last.id) : null;
    return { items: posts, nextCursor };
  }
}
