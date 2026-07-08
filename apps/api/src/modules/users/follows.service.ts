import { BadRequestException, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UserFollowedEvent } from "../../events/user-followed.event";
import { UserUnfollowedEvent } from "../../events/user-unfollowed.event";

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // Подписка. Уведомление больше НЕ пишем здесь — сервис выполняет доменное
  // действие и эмитит событие; уведомление + real-time publish делает слушатель.
  // create → на конфликте НЕ эмитим: повторный follow — no-op, иначе каждый
  // повторный клик плодил бы дубль FOLLOW-уведомления.
  async follow(followerId: string, followingId: string): Promise<boolean> {
    if (followerId === followingId) {
      throw new BadRequestException("Нельзя подписаться на самого себя");
    }
    try {
      await this.prisma.follow.create({ data: { followerId, followingId } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" // уже подписан → без события
      ) {
        return true;
      }
      throw err;
    }
    this.events.emit(
      UserFollowedEvent.EVENT,
      new UserFollowedEvent(followerId, followingId),
    );
    return true;
  }

  async unfollow(followerId: string, followingId: string): Promise<boolean> {
    const { count } = await this.prisma.follow.deleteMany({
      where: { followerId, followingId },
    });
    // подписки не стало → сбросить материализованную ленту, иначе посты бывшей
    // подписки «застрянут» в Redis-наборе (пересоберётся из БД на следующем чтении)
    if (count > 0) {
      this.events.emit(
        UserUnfollowedEvent.EVENT,
        new UserUnfollowedEvent(followerId),
      );
    }
    return true;
  }

  // id тех, на кого подписан пользователь — для персонализированной ленты
  async followingIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    return rows.map((r) => r.followingId);
  }

  // зеркало followingIds: кто подписан на автора — для fan-out поста по их лентам
  async followerIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true },
    });
    return rows.map((r) => r.followerId);
  }
}
