import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import {
  NotificationsResolver,
  FollowNotificationResolver,
  ReactionNotificationResolver,
  CommentNotificationResolver,
} from "./notifications.resolver";

@Module({
  providers: [
    NotificationsService,
    NotificationsResolver,
    FollowNotificationResolver,
    ReactionNotificationResolver,
    CommentNotificationResolver,
  ],
})
export class NotificationsModule {}
