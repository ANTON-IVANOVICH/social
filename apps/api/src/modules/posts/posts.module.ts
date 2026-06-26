import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { PostsService } from "./posts.service";
import { PostsResolver } from "./posts.resolver";
import { PostOwnerGuard } from "./guards/post-owner.guard";

@Module({
  imports: [UsersModule], // экспортирует FollowsService для персонализированной ленты
  providers: [PostsService, PostsResolver, PostOwnerGuard],
  exports: [PostsService], // нужен DataLoaderModule (postById) и feed-модулю
})
export class PostsModule {}
