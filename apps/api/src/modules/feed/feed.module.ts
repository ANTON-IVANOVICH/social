import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { PostsModule } from "../posts/posts.module";
import { UsersModule } from "../users/users.module";
import { FeedService } from "./feed.service";
import { FeedResolver } from "./feed.resolver";
import { FeedListener } from "./feed.listener";
import { FeedFanoutProcessor } from "./feed-fanout.processor";
import { GetFeedHandler } from "./cqrs/get-feed.handler";
import { FANOUT_QUEUE } from "./feed.constants";

@Module({
  imports: [
    PostsModule, // PostsService (discover)
    UsersModule, // FollowsService (followerIds для fan-out) + UsersService (discover)
    // очередь fan-out: ретраим (разнос идемпотентен), не копим выполненные в Redis
    BullModule.registerQueue({
      name: FANOUT_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 1000, age: 3600 },
        removeOnFail: { count: 5000 },
      },
    }),
  ],
  providers: [
    FeedService,
    FeedResolver,
    FeedListener,
    FeedFanoutProcessor,
    GetFeedHandler,
  ],
  // Очередь fan-out нужна OutboxModule: relayer — единственный, кто её наполняет.
  // Реэкспортируем BullModule, чтобы не заводить второй Queue (и второй коннект).
  exports: [BullModule],
})
export class FeedModule {}
