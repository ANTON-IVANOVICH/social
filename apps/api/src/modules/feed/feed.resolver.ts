import { Args, Int, Query, Resolver } from "@nestjs/graphql";
import { PostsService } from "../posts/posts.service";
import { UsersService } from "../users/users.service";
import { FeedItem } from "./models/feed-item.union";

@Resolver()
export class FeedResolver {
  constructor(
    private readonly posts: PostsService,
    private readonly users: UsersService,
  ) {}

  // Иллюстративно: лента из постов + вкраплённая рекомендация пользователя.
  // Реальный алгоритм рекомендаций — отдельная история (кэш/тренды, этап 4+).
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
