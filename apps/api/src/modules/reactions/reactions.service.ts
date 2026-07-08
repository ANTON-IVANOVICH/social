import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma, ReactionType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PostReactedEvent } from "../../events/post-reacted.event";

@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
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

    // побочные эффекты (real-time publish + уведомление автору) — в слушателе;
    // сервис только эмитит. Автора поста тянем для адресата уведомления.
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });
    if (post) {
      this.events.emit(
        PostReactedEvent.EVENT,
        new PostReactedEvent(postId, userId, post.authorId, type),
      );
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
