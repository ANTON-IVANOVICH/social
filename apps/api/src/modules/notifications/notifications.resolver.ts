import { Inject } from "@nestjs/common";
import {
  Context,
  Parent,
  Query,
  ResolveField,
  Resolver,
  Subscription,
} from "@nestjs/graphql";
import { Notification as NotificationRow } from "@prisma/client";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { IDataLoaders } from "../../common/dataloader/dataloader.types";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { User } from "../users/models/user.model";
import { Post } from "../posts/models/post.model";
import {
  Notification,
  FollowNotification,
  ReactionNotification,
  CommentNotification,
} from "./models/notification.model";
import { NotificationsService } from "./notifications.service";

interface NewNotificationPayload {
  newNotification: NotificationRow;
  recipientId: string;
}

@Resolver(() => Notification)
export class NotificationsResolver {
  constructor(
    private readonly notificationsService: NotificationsService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  @Query(() => [Notification])
  @Auth() // только свои уведомления — recipientId берём из токена, не из аргумента
  notifications(@CurrentUser() user: AuthUser) {
    // возвращаем «сырые» строки Prisma; resolveType разведёт их по типам по полю kind
    return this.notificationsService.listForRecipient(user.userId);
  }

  // «события про меня»: доставляем только адресату. resolveType интерфейса разведёт
  // строку по конкретному типу (FOLLOW/REACTION/COMMENT), реляционные поля
  // (follower/actor/post) дотянутся теми же DataLoader'ами из контекста подписки.
  @Subscription(() => Notification, {
    resolve: (payload: NewNotificationPayload) => payload.newNotification,
    filter: (
      payload: NewNotificationPayload,
      _vars: unknown,
      context: { req: { user: AuthUser } },
    ) => payload.recipientId === context.req.user.userId,
  })
  newNotification() {
    return this.pubsub.asyncIterableIterator("newNotification");
  }
}

// Реляционные поля каждого конкретного типа резолвим через те же DataLoader'ы
@Resolver(() => FollowNotification)
export class FollowNotificationResolver {
  @ResolveField(() => User)
  follower(
    @Parent() n: NotificationRow,
    @Context("loaders") loaders: IDataLoaders,
  ) {
    return loaders.userById.load(n.actorId);
  }
}

@Resolver(() => ReactionNotification)
export class ReactionNotificationResolver {
  @ResolveField(() => User)
  actor(
    @Parent() n: NotificationRow,
    @Context("loaders") loaders: IDataLoaders,
  ) {
    return loaders.userById.load(n.actorId);
  }

  @ResolveField(() => Post)
  post(@Parent() n: NotificationRow, @Context("loaders") loaders: IDataLoaders) {
    return loaders.postById.load(n.postId!);
  }
}

// CommentNotification резолвится так же, как ReactionNotification (actor + post)
@Resolver(() => CommentNotification)
export class CommentNotificationResolver {
  @ResolveField(() => User)
  actor(
    @Parent() n: NotificationRow,
    @Context("loaders") loaders: IDataLoaders,
  ) {
    return loaders.userById.load(n.actorId);
  }

  @ResolveField(() => Post)
  post(@Parent() n: NotificationRow, @Context("loaders") loaders: IDataLoaders) {
    return loaders.postById.load(n.postId!);
  }
}
