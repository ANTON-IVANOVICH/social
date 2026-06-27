import { Inject } from "@nestjs/common";
import {
  Args,
  Context,
  ID,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Subscription,
} from "@nestjs/graphql";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { IDataLoaders } from "../../common/dataloader/dataloader.types";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { User } from "../users/models/user.model";
import { Comment } from "./models/comment.model";
import { CommentsService } from "./comments.service";

interface CommentAddedPayload {
  commentAdded: Comment;
}

@Resolver(() => Comment)
export class CommentsResolver {
  constructor(
    private readonly comments: CommentsService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  @Mutation(() => Comment)
  @Auth()
  addComment(
    @Args("postId", { type: () => ID }) postId: string,
    @Args("content") content: string,
    @CurrentUser() user: AuthUser, // автор — из токена, не из аргумента
  ) {
    return this.comments.create(user.userId, postId, content);
  }

  // «события на странице»: фильтр по аргументу postId (пост, открытый клиентом)
  @Subscription(() => Comment, {
    resolve: (payload: CommentAddedPayload) => payload.commentAdded,
    filter: (payload: CommentAddedPayload, variables: { postId: string }) =>
      payload.commentAdded.postId === variables.postId,
  })
  commentAdded(@Args("postId", { type: () => ID }) _postId: string) {
    return this.pubsub.asyncIterableIterator("commentAdded");
  }

  // автор комментария — через тот же DataLoader (батчинг, в т.ч. в подписке)
  @ResolveField(() => User)
  author(@Parent() comment: Comment, @Context("loaders") loaders: IDataLoaders) {
    return loaders.userById.load(comment.authorId);
  }
}
