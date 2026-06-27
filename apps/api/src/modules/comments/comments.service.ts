import { Inject, Injectable } from "@nestjs/common";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PrismaService } from "../../prisma/prisma.service";
import { PUB_SUB } from "../../pubsub/pubsub.module";

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  async create(authorId: string, postId: string, content: string) {
    const comment = await this.prisma.comment.create({
      data: { authorId, postId, content },
    });

    // «события на странице»: подписчики этого поста получат комментарий вживую
    await this.pubsub.publish("commentAdded", { commentAdded: comment });

    // уведомляем автора поста (но не самого себя за комментарий к своему посту)
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });
    if (post && post.authorId !== authorId) {
      const notification = await this.prisma.notification.create({
        data: {
          recipientId: post.authorId,
          actorId: authorId,
          kind: "COMMENT",
          postId,
        },
      });
      await this.pubsub.publish("newNotification", {
        newNotification: notification,
        recipientId: post.authorId,
      });
    }

    return comment;
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
