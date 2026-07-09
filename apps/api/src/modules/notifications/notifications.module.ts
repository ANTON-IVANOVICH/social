import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { NotificationsService } from "./notifications.service";
import {
  NotificationsResolver,
  FollowNotificationResolver,
  ReactionNotificationResolver,
  CommentNotificationResolver,
  MentionNotificationResolver,
} from "./notifications.resolver";
import { NotificationListener } from "./notification.listener";
import { NotificationsProcessor } from "./notifications.processor";
import { NOTIFICATIONS_QUEUE } from "./notifications.constants";

@Module({
  imports: [
    // очередь доставки: длинные бэкоффы (внешние SMTP/FCM), не копим выполненные
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 1000, age: 3600 },
        removeOnFail: { count: 5000 },
      },
    }),
  ],
  providers: [
    NotificationsService,
    NotificationsResolver,
    FollowNotificationResolver,
    ReactionNotificationResolver,
    CommentNotificationResolver,
    MentionNotificationResolver,
    NotificationListener,
    NotificationsProcessor,
  ],
  // NotificationsService — саге упоминаний (PostsModule): уведомления рождаются той
  // же дорогой, что и у слушателя. BullModule — релееру (OutboxModule): гарантированный
  // разбор упоминаний ставится в эту очередь.
  exports: [NotificationsService, BullModule],
})
export class NotificationsModule {}
