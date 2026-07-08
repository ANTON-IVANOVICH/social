import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../../prisma/prisma.service";
import { CommentCreatedEvent } from "../../events/comment-created.event";

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(authorId: string, postId: string, content: string) {
    const comment = await this.prisma.comment.create({
      data: { authorId, postId, content },
    });

    // адресат уведомления — автор поста (тянем для события); real-time publish
    // (commentAdded) и запись уведомления делает слушатель
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });
    this.events.emit(
      CommentCreatedEvent.EVENT,
      new CommentCreatedEvent(comment, post?.authorId ?? authorId),
    );

    return comment;
  }

  // для DataLoader: комментарии по списку постов одним запросом (порядок треда —
  // от старых к новым; id — тай-брейкер для одинаковых миллисекунд, иначе порядок
  // «одновременных» комментариев плавал бы между чтениями); группировка — в лоадере
  findByPostIds(postIds: readonly string[]) {
    return this.prisma.comment.findMany({
      where: { postId: { in: postIds as string[] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
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
