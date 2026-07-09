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
import { CommandBus } from "@nestjs/cqrs";
import { ReactionType } from "@prisma/client";
import { RedisPubSub } from "graphql-redis-subscriptions";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GqlAuthGuard } from "../../common/guards/gql-auth.guard";
import { AuthUser } from "../../common/types/auth-user";
import { IDataLoaders } from "../../common/dataloader/dataloader.types";
import { freshLoadersPerEvent } from "../../common/dataloader/fresh-per-event";
import { PUB_SUB } from "../../pubsub/pubsub.module";
import { User } from "../users/models/user.model";
import { Comment } from "../comments/models/comment.model";
import { Post } from "./models/post.model";
import { CreatePostInput } from "./dto/create-post.input";
import { UpdatePostInput } from "./dto/update-post.input";
import { PostsService } from "./posts.service";
import { PostOwnerGuard } from "./guards/post-owner.guard";
import { CreatePostCommand } from "./cqrs/commands/create-post.command";
import { UpdatePostCommand } from "./cqrs/commands/update-post.command";
import { DeletePostCommand } from "./cqrs/commands/delete-post.command";

interface PostAddedPayload {
  postAdded: Post;
  authorId: string;
}

interface SubContext {
  req: { user: AuthUser };
  followingIds?: Set<string>;
}

// Запись и чтение идут разными путями: мутации диспетчеризуют КОМАНДЫ в шину
// (обработчик владеет транзакцией и доменными событиями), read-путь дёргает
// PostsService напрямую. PUB_SUB здесь остаётся только ради итератора подписки —
// публикует событие теперь обработчик, а не резолвер.
@Resolver(() => Post)
export class PostsResolver {
  constructor(
    private readonly posts: PostsService,
    private readonly commandBus: CommandBus,
    @Inject(PUB_SUB) private readonly pubsub: RedisPubSub,
  ) {}

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
  postAdded(@Context("loaders") loaders: IDataLoaders) {
    // лоадеры живут всю подписку → сбрасываем их кэш перед каждым событием
    return freshLoadersPerEvent(
      this.pubsub.asyncIterableIterator("postAdded"),
      loaders,
    );
  }

  @Mutation(() => Post)
  @Auth()
  createPost(
    @Args("input") input: CreatePostInput,
    @CurrentUser() user: AuthUser,
  ) {
    // authorId больше НЕ аргумент — берём из токена
    return this.commandBus.execute(new CreatePostCommand(user.userId, input));
  }

  @Mutation(() => Post)
  // порядок важен: сначала auth (ставит user), потом проверка владельца
  @UseGuards(GqlAuthGuard, PostOwnerGuard)
  updatePost(
    @Args("id", { type: () => ID }) id: string,
    @Args("input") input: UpdatePostInput,
  ) {
    return this.commandBus.execute(new UpdatePostCommand(id, input));
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, PostOwnerGuard)
  deletePost(@Args("id", { type: () => ID }) id: string) {
    return this.commandBus.execute(new DeletePostCommand(id));
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

  // read-path ветки комментариев (от старых к новым); DataLoader схлопывает
  // запросы всех постов выборки в один findMany
  @ResolveField(() => [Comment])
  comments(@Parent() post: Post, @Context("loaders") loaders: IDataLoaders) {
    return loaders.commentsByPostId.load(post.id);
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
