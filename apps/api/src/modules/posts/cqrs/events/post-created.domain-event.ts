import { Post } from "@prisma/client";

// Доменное событие агрегата: «пост создан». Публикуется в in-process EventBus
// через aggregate.commit(). Несёт всю запись — подписчикам (real-time publish,
// сага упоминаний) не нужен повторный поход в БД за тем, что уже прочитано.
export class PostCreatedDomainEvent {
  constructor(public readonly post: Post) {}
}
