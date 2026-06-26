import { Module } from "@nestjs/common";
import { UsersModule } from "../../modules/users/users.module";
import { PostsModule } from "../../modules/posts/posts.module";
import { ReactionsModule } from "../../modules/reactions/reactions.module";
import { CommentsModule } from "../../modules/comments/comments.module";
import { DataLoaderService } from "./dataloader.service";

@Module({
  imports: [UsersModule, PostsModule, ReactionsModule, CommentsModule],
  providers: [DataLoaderService],
  exports: [DataLoaderService],
})
export class DataLoaderModule {}
