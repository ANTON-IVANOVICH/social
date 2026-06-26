import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FollowsService } from "../users/follows.service";
import { encodeCursor, decodeCursor } from "../../common/cursor/cursor.util";
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
    private readonly follows: FollowsService,
  ) {}

  // Создание поста + извлечение хэштегов — атомарно, в одной транзакции
  async create(authorId: string, input: CreatePostInput) {
    const tags = extractHashtags(input.content);

    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
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
          data: hashtags.map((h) => ({ postId: post.id, hashtagId: h.id })),
          skipDuplicates: true,
        });
      }

      return post;
    });
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

  // Общая лента по свежести. На этапе 3 заменим на ленту подписок текущего юзера.
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

  // Персонализированная лента: посты подписок + свои (Этап 3, за auth-guard'ом)
  async feedForUser(userId: string, limit: number, cursor?: string) {
    const followingIds = await this.follows.followingIds(userId);
    const authorIds = [...followingIds, userId]; // подписки + свои посты

    const decoded = cursor ? decodeCursor(cursor) : null;
    const rows = await this.prisma.post.findMany({
      where: { authorId: { in: authorIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(decoded ? { cursor: { id: decoded }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeCursor(items[items.length - 1].id)
      : null;

    return { items, nextCursor };
  }

  update(id: string, input: UpdatePostInput) {
    return this.prisma.post.update({ where: { id }, data: { ...input } });
  }

  async delete(id: string): Promise<boolean> {
    await this.prisma.post.delete({ where: { id } });
    return true;
  }
}
