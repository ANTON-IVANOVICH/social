import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // создание пользователя теперь живёт в AuthService.register (с паролем) —
  // см. modules/auth. Здесь только чтение.

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  // для DataLoader: батч по списку id
  findByIds(ids: readonly string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: ids as string[] } },
    });
  }
}
