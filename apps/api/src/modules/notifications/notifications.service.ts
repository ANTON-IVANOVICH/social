import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { Notification, NotificationKind } from "@prisma/client";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PrismaService } from "../../prisma/prisma.service";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { NOTIFICATIONS_QUEUE } from "./notifications.constants";

export interface NotifyInput {
  recipientId: string;
  actorId: string;
  kind: NotificationKind;
  postId?: string;
  // задаётся, только если уведомление может родиться дважды (быстрый путь + outbox)
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  listForRecipient(recipientId: string) {
    return this.prisma.notification.findMany({
      where: { recipientId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  // ЕДИНАЯ точка рождения уведомления: запись + real-time доставка открытым
  // экранам + постановка внешней доставки (email/push) в очередь. И слушатель
  // доменных событий, и сага упоминаний зовут её — форма уведомления всюду одна.
  async notify(input: NotifyInput): Promise<Notification> {
    const notification = await this.prisma.notification.create({ data: input });
    await this.dispatch(notification);
    return notification;
  }

  // Пакетный вариант для упоминаний: одна вставка вместо N.
  //
  // skipDuplicates + уникальный dedupeKey = ровно один эффект, даже если та же
  // работа приедет дважды (сага сразу и relayer через секунду). createManyAndReturn
  // (PostgreSQL) отдаёт ТОЛЬКО реально вставленные строки, поэтому повтор ничего
  // не публикует и ничего не доставляет — сам по себе он становится no-op.
  async notifyMany(inputs: NotifyInput[]): Promise<Notification[]> {
    if (inputs.length === 0) return [];
    const notifications = await this.prisma.notification.createManyAndReturn({
      data: inputs,
      skipDuplicates: true,
    });
    for (const notification of notifications) await this.dispatch(notification);
    return notifications;
  }

  // jobId = notificationId: повторное событие не создаст дубль задачи доставки.
  // BullMQ запрещает ":" в кастомном jobId — используем "-".
  //
  // Уведомление уже в БД: сорванный publish или enqueue не должен утаскивать за
  // собой соседей по пачке. Логируем и идём дальше — получатель увидит его при
  // следующем чтении списка.
  private async dispatch(notification: Notification): Promise<void> {
    try {
      await this.pubsub.publish("newNotification", {
        newNotification: notification,
        recipientId: notification.recipientId,
      });
      await this.queue.add(
        "deliver",
        { notificationId: notification.id },
        { jobId: `deliver-${notification.id}` },
      );
    } catch (err) {
      this.logger.error(
        `не удалось разослать уведомление ${notification.id}`,
        err as Error,
      );
    }
  }
}
