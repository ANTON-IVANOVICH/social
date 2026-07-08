import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { NotificationsService } from "./notifications.service";
import {
  NotificationsResolver,
  FollowNotificationResolver,
  ReactionNotificationResolver,
  CommentNotificationResolver,
} from "./notifications.resolver";
import { NotificationListener } from "./notification.listener";
import { NotificationDeliveryProcessor } from "./notification-delivery.processor";
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
    NotificationListener,
    NotificationDeliveryProcessor,
  ],
})
export class NotificationsModule {}
