import { Inject, UseGuards } from "@nestjs/common";
import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
  Subscription,
} from "@nestjs/graphql";
import { ReactionType } from "@prisma/client";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GqlAuthGuard } from "../../common/guards/gql-auth.guard";
import { AuthUser } from "../../common/types/auth-user";
import { IDataLoaders } from "../../common/dataloader/dataloader.types";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { User } from "../users/models/user.model";
import { Post } from "./models/post.model";
import { PostConnection } from "./models/post-connection.model";
import { CreatePostInput } from "./dto/create-post.input";
import { UpdatePostInput } from "./dto/update-post.input";
import { FeedArgs } from "./dto/feed.args";
import { PostsService } from "./posts.service";
import { PostOwnerGuard } from "./guards/post-owner.guard";

interface PostAddedPayload {
  postAdded: Post;
  authorId: string;
}

interface SubContext {
  req: { user: AuthUser };
  followingIds?: Set<string>;
}

@Resolver(() => Post)
export class PostsResolver {
  constructor(
    private readonly posts: PostsService,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

  @Query(() => PostConnection)
  @Auth() // лента — только для залогиненных, по их подпискам
  feed(@Args() { limit, cursor }: FeedArgs, @CurrentUser() user: AuthUser) {
    return this.posts.feedForUser(user.userId, limit, cursor);
  }

  @Query(() => Post, { nullable: true }) // публично: отдельный пост можно посмотреть без входа
  post(@Args("id", { type: () => ID }) id: string) {
    return this.posts.findById(id);
  }

  // Живая лента: «события про меня» — фильтр по личности подписчика (из контекста
  // соединения), а не по аргументу. followingIds загружены один раз при connect.
  @Subscription(() => Post, {
    resolve: (payload: PostAddedPayload) => payload.postAdded,
    filter: (payload: PostAddedPayload, _vars: unknown, context: SubContext) =>
      (context.followingIds?.has(payload.authorId) ?? false) ||
      payload.authorId === context.req.user.userId,
  })
  postAdded() {
    return this.pubsub.asyncIterableIterator("postAdded");
  }

  @Mutation(() => Post)
  @Auth()
  createPost(
    @Args("input") input: CreatePostInput,
    @CurrentUser() user: AuthUser,
  ) {
    // authorId больше НЕ аргумент — берём из токена
    return this.posts.create(user.userId, input);
  }

  @Mutation(() => Post)
  // порядок важен: сначала auth (ставит user), потом проверка владельца
  @UseGuards(GqlAuthGuard, PostOwnerGuard)
  updatePost(
    @Args("id", { type: () => ID }) id: string,
    @Args("input") input: UpdatePostInput,
  ) {
    return this.posts.update(id, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, PostOwnerGuard)
  deletePost(@Args("id", { type: () => ID }) id: string) {
    return this.posts.delete(id);
  }

  // ── field-резолверы (без guard'ов; user доступен из контекста корневого резолвера) ──

  @ResolveField(() => User)
  author(@Parent() post: Post, @Context("loaders") loaders: IDataLoaders) {
    return loaders.userById.load(post.authorId);
  }

  @ResolveField(() => Int)
  reactionCount(
    @Parent() post: Post,
    @Context("loaders") loaders: IDataLoaders,
  ) {
    return loaders.reactionCountByPostId.load(post.id);
  }

  @ResolveField(() => Int)
  commentCount(
    @Parent() post: Post,
    @Context("loaders") loaders: IDataLoaders,
  ) {
    return loaders.commentCountByPostId.load(post.id);
  }

  // Моя реакция на пост. Текущий пользователь приезжает из контекста корневого
  // резолвера (для feed — за @Auth). На публичном `post` без входа → null.
  @ResolveField(() => ReactionType, { nullable: true })
  myReaction(
    @Parent() post: Post,
    @CurrentUser() user: AuthUser | undefined,
    @Context("loaders") loaders: IDataLoaders,
  ) {
    if (!user) return null;
    return loaders.myReactionByPostUser.load({
      postId: post.id,
      userId: user.userId,
    });
  }
}
