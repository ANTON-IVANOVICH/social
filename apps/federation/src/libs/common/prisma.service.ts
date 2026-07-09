import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Все три subgraph'а читают ОДНУ базу монолита. Так и задумано для демонстрации:
// федерация здесь разрезает ГРАФ, а не хранилище. В настоящем разрезе на сервисы
// у каждого subgraph'а была бы своя БД — и это отдельное большое решение.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
