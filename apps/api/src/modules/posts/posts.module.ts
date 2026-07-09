import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PostsService } from "./posts.service";
import { PostsResolver } from "./posts.resolver";
import { PostOwnerGuard } from "./guards/post-owner.guard";
import { PostSaga } from "./cqrs/post.saga";
import { CreatePostHandler } from "./cqrs/handlers/create-post.handler";
import { UpdatePostHandler } from "./cqrs/handlers/update-post.handler";
import { DeletePostHandler } from "./cqrs/handlers/delete-post.handler";
import { PostCreatedHandler } from "./cqrs/handlers/post-created.handler";
import { ProcessMentionsHandler } from "./cqrs/handlers/process-mentions.handler";

// Обработчики команд/запросов/событий и саги — обычные провайдеры: CqrsModule
// находит их по декораторам, обходя контейнер (CqrsModule.forRoot в AppModule).
const CQRS_PROVIDERS = [
  PostSaga,
  CreatePostHandler,
  UpdatePostHandler,
  DeletePostHandler,
  PostCreatedHandler,
  ProcessMentionsHandler,
];

@Module({
  imports: [
    UsersModule,
    NotificationsModule, // NotificationsService для саги упоминаний
  ],
  providers: [PostsService, PostsResolver, PostOwnerGuard, ...CQRS_PROVIDERS],
  exports: [PostsService], // нужен DataLoaderModule (postById) и feed-модулю
})
export class PostsModule {}
