import { Args, Int, Query, Resolver } from "@nestjs/graphql";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { PostsService } from "../posts/posts.service";
import { UsersService } from "../users/users.service";
import { PostConnection } from "../posts/models/post-connection.model";
import { FeedArgs } from "../posts/dto/feed.args";
import { FeedService } from "./feed.service";
import { FeedItem } from "./models/feed-item.union";

@Resolver()
export class FeedResolver {
  constructor(
    private readonly posts: PostsService,
    private readonly users: UsersService,
    private readonly feedService: FeedService,
  ) {}

  // Персонализированная лента подписок — теперь из МАТЕРИАЛИЗОВАННОГО набора
  // (fan-out on write): чтение O(1) вместо тяжёлой выборки на каждый запрос.
  // Дом ленты — FeedModule (переехало из PostsResolver этапа 3).
  @Query(() => PostConnection)
  @Auth()
  feed(@Args() { limit, cursor }: FeedArgs, @CurrentUser() user: AuthUser) {
    return this.feedService.readFeed(user.userId, limit, cursor);
  }

  // Иллюстративно: лента из постов + вкраплённая рекомендация пользователя.
  // Реальный алгоритм рекомендаций — отдельная история (кэш/тренды).
  @Query(() => [FeedItem])
  async discover(
    @Args("limit", { type: () => Int, defaultValue: 20 }) limit: number,
  ) {
    const { items } = await this.posts.feedGlobal(limit);
    const out: Array<object> = [...items];

    const suggested = await this.users.findByUsername(/* любой популярный */ "demo");
    if (suggested) {
      out.splice(Math.min(2, out.length), 0, {
        user: suggested,
        reason: "Популярный автор",
      });
    }
    return out;
  }
}
