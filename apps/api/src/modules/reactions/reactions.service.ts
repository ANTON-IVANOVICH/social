import { Inject, Injectable } from "@nestjs/common";
import { ReactionType } from "@prisma/client";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PrismaService } from "../../prisma/prisma.service";
import { PUB_SUB } from "../../pubsub/pubsub.module";

@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  // upsert: один пользователь — одна реакция (гарантия @@unique([postId, userId]))
  async react(userId: string, postId: string, type: ReactionType) {
    const reaction = await this.prisma.reaction.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, type },
      update: { type }, // повторная реакция меняет тип, а не плодит строки
    });

    // «события на странице»: подписчики этого поста увидят реакцию вживую
    await this.pubsub.publish("reactionAdded", {
      reactionAdded: { postId, userId, type },
    });

    // уведомляем автора поста (но не самого себя за реакцию на свой пост)
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });
    if (post && post.authorId !== userId) {
      const notification = await this.prisma.notification.create({
        data: {
          recipientId: post.authorId,
          actorId: userId,
          kind: "REACTION",
          postId,
        },
      });
      await this.pubsub.publish("newNotification", {
        newNotification: notification,
        recipientId: post.authorId,
      });
    }

    return reaction;
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
