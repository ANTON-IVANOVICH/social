import { AggregateRoot } from "@nestjs/cqrs";
import { Post } from "@prisma/client";
import { PostCreatedDomainEvent } from "./events/post-created.domain-event";

// Агрегат владеет инвариантами и доменными событиями. apply() копит события
// внутри, commit() (из обработчика команды) публикует их в EventBus. Именно здесь
// жила бы проверка «действие допустимо» — apply вызывается только если да.
export class PostAggregate extends AggregateRoot {
  constructor(private readonly post: Post) {
    super();
  }

  created(): void {
    this.apply(new PostCreatedDomainEvent(this.post));
  }
}
