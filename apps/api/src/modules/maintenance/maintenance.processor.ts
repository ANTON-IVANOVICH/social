import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { TrendingService } from "./trending.service";
import { DigestService } from "./digest.service";
import { MAINTENANCE_QUEUE } from "./maintenance.constants";

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly trending: TrendingService,
    private readonly digest: DigestService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case "recompute-trending":
        await this.trending.recompute();
        break;
      case "daily-digest":
        await this.digest.enqueueAll();
        break;
    }
  }
}
