import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../libs/common/prisma.service";

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.post.findUnique({ where: { id } });
  }

  recent(limit: number) {
    return this.prisma.post.findMany({
      where: { visibility: "PUBLIC" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
  }
}
