import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// Дневной дайджест. Реальная рассылка (per-user email) — за рамками курса; здесь
// показываем каркас: выбрать активных пользователей и запланировать доставку.
// Устроен как NotificationListener (выборка → постановка задач), поэтому реальную
// отправку оставляем заглушкой-логом.
@Injectable()
export class DigestService {
  private readonly logger = new Logger("Digest");

  constructor(private readonly prisma: PrismaService) {}

  async enqueueAll(): Promise<void> {
    // «активные» = писали пост за последнюю неделю
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const active = await this.prisma.post.findMany({
      where: { createdAt: { gt: since } },
      distinct: ["authorId"],
      select: { authorId: true },
    });
    // здесь на каждого ставилась бы задача доставки дайджеста (email)
    this.logger.log(`daily-digest: ${active.length} активных получателей (заглушка)`);
  }
}
