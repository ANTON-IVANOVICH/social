import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Job } from "bullmq";
import { Redis } from "ioredis";
import { PrismaService } from "../../prisma/prisma.service";
import { REDIS_CLIENT } from "../../redis/redis.constants";
import { ProcessMentionsCommand } from "../posts/cqrs/commands/process-mentions.command";
import { NOTIFICATIONS_QUEUE } from "./notifications.constants";

interface DeliverJob {
  notificationId: string;
}
interface MentionsJob {
  postId: string;
}

// Один воркер на очередь: два процессора с одним именем очереди подписались бы
// на ВСЕ её задачи. Поэтому разбираем по job.name.
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {
    super();
  }

  process(job: Job<DeliverJob | MentionsJob>): Promise<void> {
    switch (job.name) {
      case "deliver":
        return this.deliver((job.data as DeliverJob).notificationId);
      case "mentions":
        return this.processMentions((job.data as MentionsJob).postId);
      default:
        this.logger.warn(`неизвестная задача очереди: ${job.name}`);
        return Promise.resolve();
    }
  }

  private async deliver(notificationId: string): Promise<void> {
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

  // ГАРАНТИРОВАННЫЙ путь упоминаний. Быстрый путь — сага, она отрабатывает сразу
  // после коммита. Но MENTION — это данные, которых ждёт получатель, а не анимация:
  // падение процесса между коммитом и сагой не должно стирать уведомление. Поэтому
  // ту же команду ставит relayer из outbox-строки, а `dedupeKey` гасит повтор.
  //
  // content берём из БД, а не из payload: он там уже есть, и так задача не зависит
  // от того, что положили в outbox месяц назад.
  private async processMentions(postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      // пост удалён раньше, чем задача доехала — упоминать больше не о чем
      this.logger.debug(`пост ${postId} исчез — разбор упоминаний пропущен`);
      return;
    }
    await this.commandBus.execute(
      new ProcessMentionsCommand(post.id, post.content, post.authorId),
    );
  }
}
