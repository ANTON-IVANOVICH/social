import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { FollowsService } from "../users/follows.service";
import { FeedService } from "./feed.service";
import { FANOUT_QUEUE } from "./feed.constants";

interface FanoutJob {
  postId: string;
  authorId: string;
  createdAt: string; // сериализуется в JSON при постановке в очередь
}

@Processor(FANOUT_QUEUE)
export class FeedFanoutProcessor extends WorkerHost {
  constructor(
    private readonly follows: FollowsService,
    private readonly feed: FeedService,
  ) {
    super();
  }

  async process(job: Job<FanoutJob>): Promise<void> {
    const followerIds = await this.follows.followerIds(job.data.authorId);
    // автор тоже видит свой пост в ленте (паритет с pull-лентой этапа 3, где
    // authorIds включал самого пользователя); Set убирает дубль, если автор
    // подписан сам на себя не может, но на всякий случай
    const targets = [...new Set([...followerIds, job.data.authorId])];
    const createdAt = new Date(job.data.createdAt);

    // батчами по 1000 — чтобы для популярного автора не слать один гигантский pipeline
    for (let i = 0; i < targets.length; i += 1000) {
      await this.feed.pushToFeeds(
        targets.slice(i, i + 1000),
        job.data.postId,
        createdAt,
      );
    }
  }
}
