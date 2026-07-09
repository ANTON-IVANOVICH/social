import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { UserUnfollowedEvent } from "../../events/user-unfollowed.event";
import { FeedService } from "./feed.service";

// unfollow → сбросить материализованную ленту подписчика (пересоберётся из БД
// без постов бывшей подписки). Держим в FeedModule, чтобы UsersModule не знал
// про Redis-ленту (не ломаем развязку и не создаём циклическую зависимость).
//
// Разноса постов здесь больше нет: post.created приходит не событием в памяти,
// а строкой outbox — её доставляет relayer. Потерять fan-out теперь можно только
// вместе с самим постом.
@Injectable()
export class FeedListener {
  constructor(private readonly feed: FeedService) {}

  @OnEvent(UserUnfollowedEvent.EVENT)
  onUserUnfollowed(event: UserUnfollowedEvent): Promise<void> {
    return this.feed.invalidate(event.followerId);
  }
}
