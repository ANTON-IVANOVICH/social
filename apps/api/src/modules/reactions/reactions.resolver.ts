import { Args, ID, Mutation, Resolver } from "@nestjs/graphql";
import { ReactionType } from "@prisma/client";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { ReactionsService } from "./reactions.service";

@Resolver()
export class ReactionsResolver {
  constructor(private readonly reactions: ReactionsService) {}

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
}
