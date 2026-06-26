import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(authorId: string, postId: string, content: string) {
    return this.prisma.comment.create({ data: { authorId, postId, content } });
  }

  // для DataLoader: счётчики комментариев по списку постов одним groupBy
  async countByPostIds(postIds: readonly string[]) {
    const grouped = await this.prisma.comment.groupBy({
      by: ["postId"],
      where: { postId: { in: postIds as string[] } },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ postId: g.postId, count: g._count._all }));
  }
}
