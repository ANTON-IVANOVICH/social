import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";

@Injectable()
export class LifecycleService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(LifecycleService.name);

  onApplicationBootstrap(): void {
    // Вызовется, когда ВСЕ модули инициализированы и приложение готово
    this.logger.log("Application bootstrapped — all modules initialized");
  }

  onApplicationShutdown(signal?: string): void {
    // Вызовется при SIGINT/SIGTERM, но только если включён enableShutdownHooks()
    this.logger.log(`Application shutting down (signal: ${signal ?? "n/a"})`);
  }
}
