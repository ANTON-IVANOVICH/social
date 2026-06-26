import { Module } from "@nestjs/common";
import { PostsModule } from "../posts/posts.module";
import { UsersModule } from "../users/users.module";
import { FeedResolver } from "./feed.resolver";

@Module({
  imports: [PostsModule, UsersModule],
  providers: [FeedResolver],
})
export class FeedModule {}
