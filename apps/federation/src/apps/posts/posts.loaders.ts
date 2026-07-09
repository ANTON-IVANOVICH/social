import DataLoader from "dataloader";
import { Comment, Post } from "@prisma/client";
import { POSTS_PER_AUTHOR } from "../../libs/common/env";
import { PrismaService } from "../../libs/common/prisma.service";

export interface PostsLoaders {
  postById: DataLoader<string, Post | null>;
  postsByAuthorId: DataLoader<string, Post[]>;
  commentsByPostId: DataLoader<string, Comment[]>;
}

// Группировка «многие к одному» вручную: findMany отдаёт плоский список, а
// DataLoader обязан вернуть результат В ПОРЯДКЕ запрошенных ключей.
function groupBy<T>(rows: T[], key: (row: T) => string, ids: readonly string[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return ids.map((id) => map.get(id) ?? []);
}

export function createPostsLoaders(prisma: PrismaService): PostsLoaders {
  return {
    postById: new DataLoader<string, Post | null>(async (ids) => {
      const posts = await prisma.post.findMany({
        where: { id: { in: ids as string[] } },
      });
      const byId = new Map(posts.map((p) => [p.id, p]));
      return ids.map((id) => byId.get(id) ?? null);
    }),

    // Батчит ровно тот запрос, из-за которого федерация и болит: gateway прислал
    // N представлений User — мы забираем их посты ОДНИМ запросом.
    //
    // ТОЛЬКО PUBLIC: поле User.posts читает кто угодно, включая анонима, и зрителя
    // на этом пути нет. Без фильтра subgraph раздавал бы PRIVATE-посты любого
    // пользователя — в монолите поля User.posts нет вовсе, значит это была бы
    // новая дыра, а не паритет.
    //
    // Потолок — ПО КАЖДОМУ автору, через оконную функцию. Обычный `take` обрезал бы
    // выборку целиком, и посты «тихого» автора исчезли бы из-за плодовитого соседа;
    // а без потолка ответ не ограничен ничем. row_number() даёт и то и другое одним
    // запросом. (Честная пагинация на самом поле — limit/cursor — за рамками демо.)
    postsByAuthorId: new DataLoader<string, Post[]>(async (authorIds) => {
      // `= ANY($1::uuid[])` — единственная форма, которая здесь работает: Prisma
      // отдаёт параметры текстом, а `uuid = text` Postgres сравнивать отказывается.
      const posts = await prisma.$queryRaw<Post[]>`
        SELECT id, content, visibility, "authorId", "createdAt", "updatedAt"
        FROM (
          SELECT p.*, row_number() OVER (
            PARTITION BY p."authorId" ORDER BY p."createdAt" DESC, p.id DESC
          ) AS rn
          FROM posts p
          WHERE p."authorId" = ANY(${authorIds as string[]}::uuid[])
            AND p.visibility = 'PUBLIC'
        ) ranked
        WHERE rn <= ${POSTS_PER_AUTHOR}
        ORDER BY "createdAt" DESC, id DESC
      `;
      return groupBy(posts, (p) => p.authorId, authorIds);
    }),

    commentsByPostId: new DataLoader<string, Comment[]>(async (postIds) => {
      const comments = await prisma.comment.findMany({
        where: { postId: { in: postIds as string[] } },
        orderBy: { createdAt: "asc" },
      });
      return groupBy(comments, (c) => c.postId, postIds);
    }),
  };
}
