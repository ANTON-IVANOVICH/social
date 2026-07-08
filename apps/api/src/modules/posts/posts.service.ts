import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../../prisma/prisma.service";
import { encodeCursor, decodeCursor } from "../../common/cursor/cursor.util";
import { PostCreatedEvent } from "../../events/post-created.event";
import { CreatePostInput } from "./dto/create-post.input";
import { UpdatePostInput } from "./dto/update-post.input";

function extractHashtags(content: string): string[] {
  const matches = content.match(/#(\w+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // Создание поста + извлечение хэштегов — атомарно, в одной транзакции
  async create(authorId: string, input: CreatePostInput) {
    const tags = extractHashtags(input.content);

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          authorId,
          content: input.content,
          visibility: input.visibility ?? "PUBLIC",
        },
      });

      if (tags.length > 0) {
        // race-safe: INSERT ... ON CONFLICT DO NOTHING. upsert делает SELECT+INSERT
        // и под конкурентной записью одного и того же НОВОГО тега ловит P2002 —
        // и валит всю транзакцию вместе с постом. createMany(skipDuplicates) атомарен.
        await tx.hashtag.createMany({
          data: tags.map((tag) => ({ tag })),
          skipDuplicates: true,
        });
        const hashtags = await tx.hashtag.findMany({
          where: { tag: { in: tags } },
          select: { id: true },
        });
        await tx.postHashtag.createMany({
          data: hashtags.map((h) => ({ postId: created.id, hashtagId: h.id })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    // эмитим ПОСЛЕ коммита (внутри tx событие ушло бы до фиксации). fire-and-forget:
    // пользователь не ждёт побочных эффектов — real-time publish и fan-out по лентам
    // делает слушатель (FanoutListener). «Лучшими усилиями»: падение между commit и
    // обработкой теряет событие, но пост уже в БД и придёт через query feed —
    // гарантию даст outbox-паттерн на этапе 6.
    this.events.emit(
      PostCreatedEvent.EVENT,
      new PostCreatedEvent(post, authorId),
    );
    return post;
  }

  findById(id: string) {
    return this.prisma.post.findUnique({ where: { id } });
  }

  // для DataLoader: батч-загрузка постов по списку id
  findByIds(ids: readonly string[]) {
    return this.prisma.post.findMany({
      where: { id: { in: ids as string[] } },
    });
  }

  // Общая публичная лента по свежести (используется в discover).
  async feedGlobal(limit: number, cursor?: string) {
    const decoded = cursor ? decodeCursor(cursor) : null;

    const rows = await this.prisma.post.findMany({
      where: { visibility: "PUBLIC" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1, // +1 чтобы понять, есть ли следующая страница, без COUNT
      ...(decoded ? { cursor: { id: decoded }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeCursor(items[items.length - 1].id)
      : null;

    return { items, nextCursor };
  }

  // Персонализированная лента подписок переехала в FeedService.readFeed
  // (материализованный fan-out on write); здесь оставлена только глобальная лента
  // для discover. FollowsService всё ещё нужен модулю ленты (followerIds/backfill).

  update(id: string, input: UpdatePostInput) {
    return this.prisma.post.update({ where: { id }, data: { ...input } });
  }

  async delete(id: string): Promise<boolean> {
    await this.prisma.post.delete({ where: { id } });
    return true;
  }
}
