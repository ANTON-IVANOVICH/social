import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global() // PrismaService доступен во всех модулях без повторного импорта
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
