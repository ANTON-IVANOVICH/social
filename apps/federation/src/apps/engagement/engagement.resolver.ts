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
import { PrismaService } from "../../libs/common/prisma.service";
import { SubgraphContext } from "../../libs/common/subgraph-context";
import { EngagementLoaders } from "./engagement.loaders";
import { Post } from "./models/post.model";
import { Reaction } from "./models/reaction.model";
import { User } from "./models/user.model";

type Ref<T extends string> = { __typename: T; id: string };

@Resolver(() => Reaction)
export class ReactionsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [Reaction])
  reactionsByPost(
    @Args("postId", { type: () => ID }) postId: string,
    @Context() ctx: SubgraphContext<EngagementLoaders>,
  ) {
    return ctx.loaders.reactionsByPostId.load(postId);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }) {
    return this.prisma.reaction.findUnique({ where: { id: reference.id } });
  }

  @ResolveField(() => User)
  user(@Parent() reaction: Reaction): Ref<"User"> {
    return { __typename: "User", id: reaction.userId };
  }

  @ResolveField(() => Post)
  post(@Parent() reaction: Reaction): Ref<"Post"> {
    return { __typename: "Post", id: reaction.postId };
  }
}

// Вклад engagement'а в чужой Post. Владелец типа (posts-subgraph) про эти поля
// не знает и знать не должен — в этом вся суть независимого деплоя частей графа.
@Resolver(() => Post)
export class PostEngagementResolver {
  @ResolveField(() => Int)
  reactionCount(
    @Parent() post: Post,
    @Context() ctx: SubgraphContext<EngagementLoaders>,
  ) {
    return ctx.loaders.reactionCountByPostId.load(post.id);
  }

  @ResolveField(() => [Reaction])
  reactions(
    @Parent() post: Post,
    @Context() ctx: SubgraphContext<EngagementLoaders>,
  ) {
    return ctx.loaders.reactionsByPostId.load(post.id);
  }
}
