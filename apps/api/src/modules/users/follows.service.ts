import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  // Подписка + уведомление — атомарно. Уведомление пока пишем синхронно;
  // на этапе 5 это уедет в доменное событие + очередь (fan-out).
  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException("Нельзя подписаться на самого себя");
    }

    return this.prisma.$transaction(async (tx) => {
      const follow = await tx.follow.upsert({
        where: { followerId_followingId: { followerId, followingId } },
        create: { followerId, followingId },
        update: {},
      });
      await tx.notification.create({
        data: { recipientId: followingId, actorId: followerId, kind: "FOLLOW" },
      });
      return follow;
    });
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
