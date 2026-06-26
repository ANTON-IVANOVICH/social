import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  listForRecipient(recipientId: string) {
    return this.prisma.notification.findMany({
      where: { recipientId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}
