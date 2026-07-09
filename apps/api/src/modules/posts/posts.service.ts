import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { encodeCursor, decodeCursor } from "../../common/cursor/cursor.util";

// Read-путь агрегата Post. Запись целиком уехала в обработчики команд
// (posts/cqrs/handlers): у неё своя транзакция, свои доменные события и outbox.
// Здесь остаётся то, что нужно резолверам и DataLoader'ам, — только чтение.
@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

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

  // Персонализированная лента подписок живёт в FeedService.readFeed
  // (материализованный fan-out on write) и читается через GetFeedQuery.
}
