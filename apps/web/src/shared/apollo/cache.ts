import { InMemoryCache, type Reference } from "@apollo/client";

// Страница ленты с бэкенда: PostConnection { items: [Post!]!, nextCursor: String }
interface FeedPage {
  items: readonly unknown[];
  nextCursor: string | null;
  __typename?: string;
}

interface FeedMergeOptions {
  args: { cursor?: string | null } | null;
  readField: (fieldName: string, from: Reference) => unknown;
}

// InMemoryCache нормализует сущности по __typename + id (User/Post переиспользуются
// между запросами). PostConnection — транзиентная обёртка без id, поэтому курсорную
// ленту склеиваем вручную через field policy.
export const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        feed: {
          // все вызовы feed() — одно логическое поле; курсор не плодит записи кэша
          keyArgs: false,
          merge(
            existing: FeedPage | undefined,
            incoming: FeedPage,
            { args, readField }: FeedMergeOptions,
          ): FeedPage {
            // первая страница (без курсора) заменяет; следующие — дописываются
            if (!args?.cursor) return incoming;
            // merge идемпотентен: дедуп по id, чтобы повторная запись той же
            // страницы (напр. гонка fetchMore) не продублировала посты
            const existingItems = existing?.items ?? [];
            const seen = new Set(
              existingItems.map((r) => readField("id", r as Reference)),
            );
            const fresh = incoming.items.filter(
              (r) => !seen.has(readField("id", r as Reference)),
            );
            return { ...incoming, items: [...existingItems, ...fresh] };
          },
        },
      },
    },
  },
});
