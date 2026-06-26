import { Args, ID, Mutation, Resolver } from "@nestjs/graphql";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { CommentsService } from "./comments.service";

@Resolver()
export class CommentsResolver {
  constructor(private readonly comments: CommentsService) {}

  @Mutation(() => Boolean)
  @Auth()
  async addComment(
    @Args("postId", { type: () => ID }) postId: string,
    @Args("content") content: string,
    @CurrentUser() user: AuthUser, // автор — из токена, не из аргумента
  ) {
    await this.comments.create(user.userId, postId, content);
    return true;
  }
}
