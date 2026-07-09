import {
  Args,
  Context,
  ID,
  Int,
  Parent,
  Query,
  ResolveField,
  ResolveReference,
  Resolver,
} from "@nestjs/graphql";
import { SubgraphContext } from "../../libs/common/subgraph-context";
import { PostsLoaders } from "./posts.loaders";
import { PostsService } from "./posts.service";
import { Comment } from "./models/comment.model";
import { Post } from "./models/post.model";
import { User } from "./models/user.model";

// Ссылка на сущность чужого subgraph'а — это НЕ объект User, а «представление»:
// __typename + значения ключа. Остальные поля gateway достроит сам, сходив к
// владельцу типа. Ровно так граф и сшивается.
type UserReference = { __typename: "User"; id: string };

@Resolver(() => Post)
export class PostsResolver {
  // имя поля не `posts`: оно столкнулось бы с методом-резолвером ниже
  constructor(private readonly postsService: PostsService) {}

  @Query(() => Post, { nullable: true })
  post(@Args("id", { type: () => ID }) id: string) {
    return this.postsService.findById(id);
  }

  @Query(() => [Post])
  posts(@Args("limit", { type: () => Int, defaultValue: 10 }) limit: number) {
    return this.postsService.recent(limit);
  }

  // см. комментарий в UsersResolver: параметры reference-резолвера без декораторов
  @ResolveReference()
  resolveReference(
    reference: { __typename: string; id: string },
    context: SubgraphContext<PostsLoaders>,
  ) {
    return context.loaders.postById.load(reference.id);
  }

  @ResolveField(() => User)
  author(@Parent() post: Post): UserReference {
    return { __typename: "User", id: post.authorId };
  }

  @ResolveField(() => [Comment])
  comments(
    @Parent() post: Post,
    @Context() ctx: SubgraphContext<PostsLoaders>,
  ) {
    return ctx.loaders.commentsByPostId.load(post.id);
  }
}

// Вклад posts-subgraph'а в чужой тип User: поле posts. Gateway пришлёт сюда
// представление { __typename: 'User', id } — большего для выборки не нужно.
@Resolver(() => User)
export class UserPostsResolver {
  @ResolveField(() => [Post])
  posts(
    @Parent() user: User,
    @Context() ctx: SubgraphContext<PostsLoaders>,
  ) {
    return ctx.loaders.postsByAuthorId.load(user.id);
  }
}

@Resolver(() => Comment)
export class CommentsResolver {
  @ResolveField(() => User)
  author(@Parent() comment: Comment): UserReference {
    return { __typename: "User", id: comment.authorId };
  }
}
