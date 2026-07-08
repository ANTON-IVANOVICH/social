import { Post } from "@prisma/client";

// Доменные события — простые DTO без привязки к модулям: слушателям не нужно
// импортировать модули-эмитенты, в этом вся развязка.
export class PostCreatedEvent {
  static readonly EVENT = "post.created";
  constructor(
    public readonly post: Post,
    public readonly authorId: string,
  ) {}
}
