import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TrendingService } from "./trending.service";
import { DigestService } from "./digest.service";
import { MaintenanceScheduler } from "./maintenance.scheduler";
import { MaintenanceProcessor } from "./maintenance.processor";
import { MaintenanceResolver } from "./maintenance.resolver";
import { MAINTENANCE_QUEUE } from "./maintenance.constants";

@Module({
  imports: [
    // очередь обслуживания: без ретраев (пересчёт идемпотентен, следующий cron повторит)
    BullModule.registerQueue({
      name: MAINTENANCE_QUEUE,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    }),
  ],
  providers: [
    TrendingService,
    DigestService,
    MaintenanceScheduler,
    MaintenanceProcessor,
    MaintenanceResolver,
  ],
})
export class MaintenanceModule {}
