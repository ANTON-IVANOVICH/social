import { Inject } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PUB_SUB } from "../../../../pubsub/pubsub.module";
import { PostCreatedDomainEvent } from "../events/post-created.domain-event";

// Реальное время намеренно остаётся best-effort: онлайн-подписчикам постим сразу,
// и если инстанс упадёт до publish — экран просто не дёрнется, а пост никуда не
// денется (придёт через query feed). Гарантию нужно давать материализации ленты,
// а не анимации — её и даёт outbox.
@EventsHandler(PostCreatedDomainEvent)
export class PostCreatedHandler
  implements IEventHandler<PostCreatedDomainEvent>
{
  constructor(@Inject(PUB_SUB) private readonly pubsub: RedisPubSub) {}

  async handle(event: PostCreatedDomainEvent): Promise<void> {
    await this.pubsub.publish("postAdded", {
      postAdded: event.post,
      authorId: event.post.authorId,
    });
  }
}
