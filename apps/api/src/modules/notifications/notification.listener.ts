import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { UserFollowedEvent } from "../../events/user-followed.event";
import { PostReactedEvent } from "../../events/post-reacted.event";
import { CommentCreatedEvent } from "../../events/comment-created.event";
import { NotificationsService } from "./notifications.service";

// Побочные эффекты доменных событий: публикация «событий страницы» в подписки и
// рождение уведомления через NotificationsService. Сервисы-эмитенты про это
// ничего не знают — развязка. Пост создаётся через CommandBus, и его событие
// живёт в CQRS-шине, а не здесь: у него свой обработчик и своя сага.
@Injectable()
export class NotificationListener {
  constructor(
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(UserFollowedEvent.EVENT)
  async onUserFollowed(e: UserFollowedEvent): Promise<void> {
    await this.notifications.notify({
      recipientId: e.followingId,
      actorId: e.followerId,
      kind: "FOLLOW",
    });
  }

  @OnEvent(PostReactedEvent.EVENT)
  async onPostReacted(e: PostReactedEvent): Promise<void> {
    // событие «на странице поста» — всегда (счётчики двигаются у зрителей)
    await this.pubsub.publish("reactionAdded", {
      reactionAdded: { postId: e.postId, userId: e.actorId, type: e.type },
    });
    if (e.actorId === e.postAuthorId) return; // на свой пост не уведомляем
    await this.notifications.notify({
      recipientId: e.postAuthorId,
      actorId: e.actorId,
      kind: "REACTION",
      postId: e.postId,
    });
  }

  @OnEvent(CommentCreatedEvent.EVENT)
  async onCommentCreated(e: CommentCreatedEvent): Promise<void> {
    // событие «на странице поста» — всегда (комментарий появляется у зрителей)
    await this.pubsub.publish("commentAdded", { commentAdded: e.comment });
    if (e.comment.authorId === e.postAuthorId) return; // свой комментарий — без уведомления
    await this.notifications.notify({
      recipientId: e.postAuthorId,
      actorId: e.comment.authorId,
      kind: "COMMENT",
      postId: e.comment.postId,
    });
  }
}
