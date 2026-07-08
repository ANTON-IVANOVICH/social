import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.constants";
import { NOTIFICATIONS_QUEUE } from "./notifications.constants";

interface DeliverJob {
  notificationId: string;
}

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger("NotificationDelivery");

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async process(job: Job<DeliverJob>): Promise<void> {
    if (job.name !== "deliver") return;
    const { notificationId } = job.data;

    // Идемпотентность: ретрай задачи (или дубль) не должен слать письмо дважды.
    // SET key NX EX — атомарная отметка «доставлено»; если ключ уже есть → пропускаем.
    const marked = await this.redis.set(
      `delivered:${notificationId}`,
      "1",
      "EX",
      60 * 60 * 24 * 7, // неделя — окно защиты от повторной доставки
      "NX",
    );
    if (marked === null) {
      this.logger.debug(`notification ${notificationId} уже доставлено — пропуск`);
      return;
    }

    // здесь была бы реальная отправка (SMTP/FCM). Заглушка.
    this.logger.log(`delivering notification ${notificationId} (заглушка SMTP/FCM)`);
  }
}
