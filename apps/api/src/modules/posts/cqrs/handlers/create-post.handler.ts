import { CommandHandler, EventPublisher, ICommandHandler } from "@nestjs/cqrs";
import { Post } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { OUTBOX_POST_CREATED } from "../../../outbox/outbox.constants";
import { extractHashtags } from "../../hashtag.util";
import { CreatePostCommand } from "../commands/create-post.command";
import { PostAggregate } from "../post.aggregate";

@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: CreatePostCommand): Promise<Post> {
    const { authorId, input } = command;
    const tags = extractHashtags(input.content);

    // ОДНА транзакция: пост + хэштеги + outbox-строка. Раньше пост коммитился, а
    // событие уходило отдельно — падение между ними теряло fan-out. Теперь либо
    // есть и пост, и запись о событии, либо нет ничего.
    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          authorId,
          content: input.content,
          visibility: input.visibility ?? "PUBLIC",
        },
      });

      if (tags.length > 0) {
        // race-safe: INSERT ... ON CONFLICT DO NOTHING. upsert делает SELECT+INSERT
        // и под конкурентной записью одного и того же НОВОГО тега ловит P2002 —
        // и валит всю транзакцию вместе с постом. createMany(skipDuplicates) атомарен.
        await tx.hashtag.createMany({
          data: tags.map((tag) => ({ tag })),
          skipDuplicates: true,
        });
        const hashtags = await tx.hashtag.findMany({
          where: { tag: { in: tags } },
          select: { id: true },
        });
        await tx.postHashtag.createMany({
          data: hashtags.map((h) => ({ postId: created.id, hashtagId: h.id })),
          skipDuplicates: true,
        });
      }

      await tx.outboxEvent.create({
        data: {
          type: OUTBOX_POST_CREATED,
          payload: {
            postId: created.id,
            authorId,
            createdAt: created.createdAt.toISOString(),
          },
        },
      });

      return created;
    });

    // Агрегат публикует доменное событие в EventBus. Слушатели — БЫСТРЫЕ in-process
    // реакции (real-time publish) и сага (упоминания). Durable-эффекты (fan-out по
    // лентам) идут не отсюда, а из outbox — их нельзя терять вместе с процессом.
    const aggregate = this.publisher.mergeObjectContext(new PostAggregate(post));
    aggregate.created();
    aggregate.commit();

    return post;
  }
}
