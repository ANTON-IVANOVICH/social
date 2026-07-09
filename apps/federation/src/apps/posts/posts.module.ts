import { Module } from "@nestjs/common";
import { AuthModule } from "../../libs/common/auth.module";
import { PrismaModule } from "../../libs/common/prisma.module";
import { subgraphGraphQLModule } from "../../libs/common/subgraph";
import { createPostsLoaders } from "./posts.loaders";
import {
  CommentsResolver,
  PostsResolver,
  UserPostsResolver,
} from "./posts.resolver";
import { PostsService } from "./posts.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    subgraphGraphQLModule("src/apps/posts/schema.gql", createPostsLoaders),
  ],
  providers: [PostsService, PostsResolver, UserPostsResolver, CommentsResolver],
})
export class PostsSubgraphModule {}
