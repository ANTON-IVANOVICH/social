import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { FeedPage, FeedService } from "../feed.service";
import { GetFeedQuery } from "./get-feed.query";

@QueryHandler(GetFeedQuery)
export class GetFeedHandler implements IQueryHandler<GetFeedQuery> {
  constructor(private readonly feed: FeedService) {}

  execute(query: GetFeedQuery): Promise<FeedPage> {
    return this.feed.readFeed(query.userId, query.limit, query.cursor);
  }
}
