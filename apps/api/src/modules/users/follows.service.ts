import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PrismaService } from "../../prisma/prisma.service";
import { PUB_SUB } from "../../pubsub/pubsub.module";

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  // Подписка + уведомление — атомарно. Уведомление пока пишем синхронно;
  // на этапе 5 это уедет в доменное событие + очередь (fan-out).
  async follow(followerId: string, followingId: string): Promise<boolean> {
    if (followerId === followingId) {
      throw new BadRequestException("Нельзя подписаться на самого себя");
    }

    const { notification } = await this.prisma.$transaction(async (tx) => {
      const follow = await tx.follow.upsert({
        where: { followerId_followingId: { followerId, followingId } },
        create: { followerId, followingId },
        update: {},
      });
      const notification = await tx.notification.create({
        data: { recipientId: followingId, actorId: followerId, kind: "FOLLOW" },
      });
      return { follow, notification };
    });

    // публикуем уведомление ПОСЛЕ коммита транзакции
    await this.pubsub.publish("newNotification", {
      newNotification: notification,
      recipientId: followingId,
    });
    return true;
  }

  async unfollow(followerId: string, followingId: string): Promise<boolean> {
    await this.prisma.follow.deleteMany({ where: { followerId, followingId } });
    return true;
  }

  // id тех, на кого подписан пользователь — понадобится для ленты на этапе 3
  async followingIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    return rows.map((r) => r.followingId);
  }
}
