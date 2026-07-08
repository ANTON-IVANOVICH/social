import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { OnEvent } from "@nestjs/event-emitter";
import { Queue } from "bullmq";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { PostCreatedEvent } from "../../events/post-created.event";
import { UserUnfollowedEvent } from "../../events/user-unfollowed.event";
import { FeedService } from "./feed.service";
import { FANOUT_QUEUE } from "./feed.constants";

@Injectable()
export class FanoutListener {
  constructor(
    @InjectQueue(FANOUT_QUEUE) private readonly queue: Queue,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
    private readonly feed: FeedService,
  ) {}

  // unfollow → сбросить материализованную ленту подписчика (пересоберётся из БД
  // без постов бывшей подписки). Держим в FeedModule, чтобы UsersModule не знал
  // про Redis-ленту (не ломаем развязку и не создаём циклическую зависимость).
  @OnEvent(UserUnfollowedEvent.EVENT)
  onUserUnfollowed(event: UserUnfollowedEvent): Promise<void> {
    return this.feed.invalidate(event.followerId);
  }

  @OnEvent(PostCreatedEvent.EVENT)
  async onPostCreated(event: PostCreatedEvent): Promise<void> {
    // 1) онлайн-подписчикам — мгновенно через подписку postAdded (WS, этап 4)
    await this.pubsub.publish("postAdded", {
      postAdded: event.post,
      authorId: event.authorId,
    });

    // 2) офлайн-материализация: разнос id поста по лентам подписчиков в фоне.
    // jobId = один пост → одна задача (идемпотентность при повторном событии).
    // BullMQ запрещает ":" в кастомном jobId — используем "-".
    await this.queue.add(
      "fanout",
      {
        postId: event.post.id,
        authorId: event.authorId,
        createdAt: event.post.createdAt,
      },
      { jobId: `fanout-${event.post.id}` },
    );
  }
}
