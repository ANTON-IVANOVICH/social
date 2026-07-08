import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { OnEvent } from "@nestjs/event-emitter";
import { Queue } from "bullmq";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PrismaService } from "../../prisma/prisma.service";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { UserFollowedEvent } from "../../events/user-followed.event";
import { PostReactedEvent } from "../../events/post-reacted.event";
import { CommentCreatedEvent } from "../../events/comment-created.event";
import { NOTIFICATIONS_QUEUE } from "./notifications.constants";

// Все побочные эффекты доменных событий: real-time publish (для открытых экранов),
// запись уведомления в БД и постановка асинхронной доставки (email/push) в очередь.
// Сервисы-эмитенты про это ничего не знают — развязка.
@Injectable()
export class NotificationListener {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  @OnEvent(UserFollowedEvent.EVENT)
  async onUserFollowed(e: UserFollowedEvent): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        recipientId: e.followingId,
        actorId: e.followerId,
        kind: "FOLLOW",
      },
    });
    await this.pubsub.publish("newNotification", {
      newNotification: notification,
      recipientId: e.followingId,
    });
    await this.enqueueDelivery(notification.id);
  }

  @OnEvent(PostReactedEvent.EVENT)
  async onPostReacted(e: PostReactedEvent): Promise<void> {
    // событие «на странице поста» — всегда (счётчики двигаются у зрителей)
    await this.pubsub.publish("reactionAdded", {
      reactionAdded: { postId: e.postId, userId: e.actorId, type: e.type },
    });
    if (e.actorId === e.postAuthorId) return; // на свой пост не уведомляем
    const notification = await this.prisma.notification.create({
      data: {
        recipientId: e.postAuthorId,
        actorId: e.actorId,
        kind: "REACTION",
        postId: e.postId,
      },
    });
    await this.pubsub.publish("newNotification", {
      newNotification: notification,
      recipientId: e.postAuthorId,
    });
    await this.enqueueDelivery(notification.id);
  }

  @OnEvent(CommentCreatedEvent.EVENT)
  async onCommentCreated(e: CommentCreatedEvent): Promise<void> {
    // событие «на странице поста» — всегда (комментарий появляется у зрителей)
    await this.pubsub.publish("commentAdded", { commentAdded: e.comment });
    if (e.comment.authorId === e.postAuthorId) return; // свой комментарий — без уведомления
    const notification = await this.prisma.notification.create({
      data: {
        recipientId: e.postAuthorId,
        actorId: e.comment.authorId,
        kind: "COMMENT",
        postId: e.comment.postId,
      },
    });
    await this.pubsub.publish("newNotification", {
      newNotification: notification,
      recipientId: e.postAuthorId,
    });
    await this.enqueueDelivery(notification.id);
  }

  // jobId = notificationId: повторное событие не создаст дубль задачи доставки.
  // BullMQ запрещает ":" в кастомном jobId — используем "-".
  private enqueueDelivery(notificationId: string): Promise<unknown> {
    return this.queue.add(
      "deliver",
      { notificationId },
      { jobId: `deliver-${notificationId}` },
    );
  }
}
