import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      // в dev логируем запросы — удобно видеть N+1 и его устранение
      log: (process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"]) as Prisma.LogLevel[],
    });
  }

  async onModuleInit(): Promise<void> {
    // fail-fast: упасть при старте, если БД недоступна, лучше чем валить запросы
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    // graceful shutdown: закрываем пул соединений (вместе с enableShutdownHooks)
    await this.$disconnect();
  }
}
