import { Injectable } from "@nestjs/common";
import { ReactionType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ReactionsService {
  constructor(private readonly prisma: PrismaService) {}

  // upsert: один пользователь — одна реакция (гарантия @@unique([postId, userId]))
  react(userId: string, postId: string, type: ReactionType) {
    return this.prisma.reaction.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, type },
      update: { type }, // повторная реакция меняет тип, а не плодит строки
    });
  }

  async unreact(userId: string, postId: string): Promise<boolean> {
    await this.prisma.reaction.deleteMany({ where: { postId, userId } });
    return true;
  }

  // для DataLoader: счётчики реакций по списку постов одним groupBy
  async countByPostIds(postIds: readonly string[]) {
    const grouped = await this.prisma.reaction.groupBy({
      by: ["postId"],
      where: { postId: { in: postIds as string[] } },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ postId: g.postId, count: g._count._all }));
  }

  // для DataLoader myReaction: реакции по парам (postId, userId) одним запросом
  findForPairs(keys: readonly { postId: string; userId: string }[]) {
    if (keys.length === 0) return Promise.resolve([]);
    return this.prisma.reaction.findMany({
      where: { OR: keys.map((k) => ({ postId: k.postId, userId: k.userId })) },
      select: { postId: true, userId: true, type: true },
    });
  }
}
