import { Injectable } from "@nestjs/common";
import DataLoader from "dataloader";
import { UsersService } from "../../modules/users/users.service";
import { PostsService } from "../../modules/posts/posts.service";
import { ReactionsService } from "../../modules/reactions/reactions.service";
import { CommentsService } from "../../modules/comments/comments.service";
import { IDataLoaders } from "./dataloader.types";

@Injectable()
export class DataLoaderService {
  constructor(
    private readonly users: UsersService,
    private readonly posts: PostsService,
    private readonly reactions: ReactionsService,
    private readonly comments: CommentsService,
  ) {}

  // Вызывается на КАЖДЫЙ запрос → свежие лоадеры (кэш живёт в пределах запроса)
  createLoaders(): IDataLoaders {
    return {
      userById: new DataLoader(async (ids: readonly string[]) => {
        const users = await this.users.findByIds(ids);
        const map = new Map(users.map((u) => [u.id, u]));
        // КРИТИЧНО: вернуть в том же порядке, что пришли ids (null для отсутствующих)
        return ids.map((id) => map.get(id) ?? null);
      }),

      postById: new DataLoader(async (ids: readonly string[]) => {
        const posts = await this.posts.findByIds(ids);
        const map = new Map(posts.map((p) => [p.id, p]));
        return ids.map((id) => map.get(id) ?? null);
      }),

      reactionCountByPostId: new DataLoader(async (postIds: readonly string[]) => {
        const counts = await this.reactions.countByPostIds(postIds);
        const map = new Map(counts.map((c) => [c.postId, c.count]));
        return postIds.map((id) => map.get(id) ?? 0);
      }),

      commentCountByPostId: new DataLoader(async (postIds: readonly string[]) => {
        const counts = await this.comments.countByPostIds(postIds);
        const map = new Map(counts.map((c) => [c.postId, c.count]));
        return postIds.map((id) => map.get(id) ?? 0);
      }),

      // ветка комментариев поста: один findMany на все посты запроса, порядок
      // внутри поста сохранён (orderBy createdAt в сервисе, push не переставляет)
      commentsByPostId: new DataLoader(async (postIds: readonly string[]) => {
        const comments = await this.comments.findByPostIds(postIds);
        const map = new Map<string, typeof comments>();
        for (const c of comments) {
          const list = map.get(c.postId);
          if (list) list.push(c);
          else map.set(c.postId, [c]);
        }
        return postIds.map((id) => map.get(id) ?? []);
      }),

      // составной ключ (postId, userId) → cacheKeyFn сводит его к строке для кэша
      myReactionByPostUser: new DataLoader(
        async (keys: readonly { postId: string; userId: string }[]) => {
          const reactions = await this.reactions.findForPairs(keys);
          const map = new Map(
            reactions.map((r) => [`${r.postId}:${r.userId}`, r.type]),
          );
          return keys.map((k) => map.get(`${k.postId}:${k.userId}`) ?? null);
        },
        {
          cacheKeyFn: (k: { postId: string; userId: string }) =>
            `${k.postId}:${k.userId}`,
        },
      ),
    };
  }
}
