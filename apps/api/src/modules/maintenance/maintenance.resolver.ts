import { Query, Resolver } from "@nestjs/graphql";
import { TrendingHashtag } from "./models/trending-hashtag.model";
import { TrendingService } from "./trending.service";

@Resolver()
export class MaintenanceResolver {
  constructor(private readonly trendingService: TrendingService) {}

  // тяжёлый JOIN считается планировщиком раз в 30 мин, здесь — раздача из кэша
  @Query(() => [TrendingHashtag])
  trending(): Promise<TrendingHashtag[]> {
    return this.trendingService.getTrending();
  }
}
