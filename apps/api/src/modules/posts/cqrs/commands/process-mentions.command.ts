import { Command } from "@nestjs/cqrs";

// Команду порождает не резолвер, а САГА — как реакцию на доменное событие.
// Точка входа в кросс-агрегатный эффект: пост создан → упомянутые получают уведомление.
export class ProcessMentionsCommand extends Command<void> {
  constructor(
    public readonly postId: string,
    public readonly content: string,
    public readonly authorId: string,
  ) {
    super();
  }
}
