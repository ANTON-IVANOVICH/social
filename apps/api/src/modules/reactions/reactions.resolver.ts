import { Inject } from "@nestjs/common";
import { Args, ID, Mutation, Resolver, Subscription } from "@nestjs/graphql";
import { ReactionType } from "@prisma/client";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { ReactionEvent } from "./models/reaction-event.model";
import { ReactionsService } from "./reactions.service";

interface ReactionAddedPayload {
  reactionAdded: ReactionEvent;
}

@Resolver()
export class ReactionsResolver {
  constructor(
    private readonly reactions: ReactionsService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  @Mutation(() => Boolean)
  @Auth()
  async react(
    @Args("postId", { type: () => ID }) postId: string,
    @Args("type", { type: () => ReactionType }) type: ReactionType,
    @CurrentUser() user: AuthUser,
  ) {
    await this.reactions.react(user.userId, postId, type);
    return true;
  }

  @Mutation(() => Boolean)
  @Auth()
  unreact(
    @Args("postId", { type: () => ID }) postId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reactions.unreact(user.userId, postId);
  }

  // «события на странице»: фильтр по аргументу postId (пост, открытый клиентом)
  @Subscription(() => ReactionEvent, {
    resolve: (payload: ReactionAddedPayload) => payload.reactionAdded,
    filter: (payload: ReactionAddedPayload, variables: { postId: string }) =>
      payload.reactionAdded.postId === variables.postId,
  })
  reactionAdded(@Args("postId", { type: () => ID }) _postId: string) {
    return this.pubsub.asyncIterableIterator("reactionAdded");
  }
}
