import { Inject, Injectable } from "@nestjs/common";
import { Prisma, ReactionType } from "@prisma/client";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PrismaService } from "../../prisma/prisma.service";
import { PUB_SUB } from "../../pubsub/pubsub.module";

@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  // один пользователь — одна реакция (гарантия @@unique([postId, userId])).
  // create → на конфликте update: уникальный индекс сам решает гонку параллельных
  // react — «создателем» будет ровно один вызов, событие/уведомление не задвоятся
  async react(userId: string, postId: string, type: ReactionType) {
    let reaction;
    let created = false;
    try {
      reaction = await this.prisma.reaction.create({
        data: { postId, userId, type },
      });
      created = true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" // нарушение @@unique → реакция уже есть
      ) {
        reaction = await this.prisma.reaction.update({
          where: { postId_userId: { postId, userId } },
          data: { type }, // повторная реакция меняет тип, а не плодит строки
        });
      } else {
        throw err;
      }
    }

    // смена типа существующей — НЕ новое событие и НЕ повод для уведомления
    if (!created) return reaction;

    // «события на странице»: подписчики поста двигают счётчик по этому событию,
    // поэтому публикуем только ДОБАВЛЕНИЕ реакции, не смену её типа
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
