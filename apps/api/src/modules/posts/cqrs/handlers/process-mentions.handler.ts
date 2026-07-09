import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { PrismaService } from "../../../../prisma/prisma.service";
import { NotificationsService } from "../../../notifications/notifications.service";
import { ProcessMentionsCommand } from "../commands/process-mentions.command";

// Верхняя граница на пост: длина контента ограничена валидатором, но «@a @b @c…»
// всё равно позволяет адресовать сотни людей одним постом. Режем — уведомления
// это рассылка, а рассылку без потолка легко превратить в оружие.
const MAX_MENTIONS = 20;

@CommandHandler(ProcessMentionsCommand)
export class ProcessMentionsHandler
  implements ICommandHandler<ProcessMentionsCommand>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async execute(command: ProcessMentionsCommand): Promise<void> {
    const usernames = [
      ...new Set(
        (command.content.match(/@(\w+)/g) ?? []).map((m) =>
          m.slice(1).toLowerCase(),
        ),
      ),
    ].slice(0, MAX_MENTIONS);
    if (usernames.length === 0) return;

    // username хранится с регистром, каким его ввели при регистрации, а «@Alice»
    // и «@alice» для читателя одно и то же → сравниваем регистронезависимо.
    const users = await this.prisma.user.findMany({
      where: {
        OR: usernames.map((username) => ({
          username: { equals: username, mode: "insensitive" as const },
        })),
      },
      select: { id: true },
    });

    await this.notifications.notifyMany(
      users
        .filter((u) => u.id !== command.authorId) // упоминание самого себя — не событие
        .map((u) => ({
          recipientId: u.id,
          actorId: command.authorId,
          kind: "MENTION" as const,
          postId: command.postId,
          // Команда приходит по ДВУМ дорогам: сага (сразу) и outbox-релеер
          // (гарантированно, если сага не отработала). dedupeKey делает вторую
          // дорогу безвредной: вставка отсеется уникальным индексом.
          dedupeKey: `mention:${command.postId}:${u.id}`,
        })),
    );
  }
}
