import { Inject } from "@nestjs/common";
import { Args, ID, Mutation, Resolver, Subscription } from "@nestjs/graphql";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { PresenceEvent, TypingEvent } from "./models/presence.models";

interface TypingPayload {
  typing: { postId: string; userId: string; isTyping: boolean };
}

@Resolver()
export class PresenceResolver {
  constructor(@Inject(PUB_SUB) private readonly pubsub: RedisPubSub) {}

  @Mutation(() => Boolean)
  @Auth()
  async setTyping(
    @Args("postId", { type: () => ID }) postId: string,
    @Args("isTyping") isTyping: boolean,
    @CurrentUser() user: AuthUser,
  ): Promise<boolean> {
    // typing нигде не сохраняем — это чисто живой сигнал поверх PubSub
    await this.pubsub.publish("typing", {
      typing: { postId, userId: user.userId, isTyping },
    });
    return true;
  }

  @Subscription(() => TypingEvent, {
    resolve: (p: TypingPayload) => p.typing,
    // «события на странице»: фильтр по аргументу postId; себе свой typing не шлём
    filter: (
      payload: TypingPayload,
      variables: { postId: string },
      context: { req: { user: AuthUser } },
    ) =>
      payload.typing.postId === variables.postId &&
      payload.typing.userId !== context.req.user.userId,
  })
  typing(@Args("postId", { type: () => ID }) _postId: string) {
    return this.pubsub.asyncIterableIterator("typing");
  }

  @Subscription(() => PresenceEvent, {
    resolve: (p: { presenceChanged: PresenceEvent }) => p.presenceChanged,
  })
  presenceChanged() {
    return this.pubsub.asyncIterableIterator("presenceChanged");
  }
}
