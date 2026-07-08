import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Queue } from "bullmq";
import { MAINTENANCE_QUEUE } from "./maintenance.constants";

// Многоинстансность: @Cron срабатывает на КАЖДОМ инстансе. Чтобы работа выполнилась
// один раз, cron не делает её сам, а ставит задачу с ФИКСИРОВАННЫМ jobId — BullMQ
// дедуплицирует по jobId, задача создаётся одна. jobId = лёгкий распределённый замок.
@Injectable()
export class MaintenanceScheduler {
  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {}

  // removeOnFail:true КРИТИЧНО при фиксированном jobId: иначе упавшая задача
  // остаётся в очереди, а повторный add с тем же jobId дедуплицируется в неё —
  // и следующий cron уже никогда не создаст новую (задача «залипает» навсегда).
  // Удаляем и при успехе, и при провале → каждый cron стартует с чистого jobId.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduleTrending(): Promise<void> {
    await this.queue.add(
      "recompute-trending",
      {},
      { jobId: "recompute-trending", removeOnComplete: true, removeOnFail: true },
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async scheduleDigest(): Promise<void> {
    await this.queue.add(
      "daily-digest",
      {},
      { jobId: "daily-digest", removeOnComplete: true, removeOnFail: true },
    );
  }
}
