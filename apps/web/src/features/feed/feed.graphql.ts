import type { QueryRef } from "@apollo/client/react";
import { type DocumentType, graphql } from "../../gql";

// Запрос ленты спредит фрагмент PostCard_post (определён в post.fragments.ts).
// codegen статически сканирует src/**/*.{ts,tsx}, находит фрагмент и инлайнит его
// в документ — runtime-импорт не нужен. masking отдаёт каждому PostCard свои поля.
export const FeedQuery = graphql(`
  query Feed($cursor: String) {
    feed(limit: 20, cursor: $cursor) {
      items {
        id
        # content нужен уровню списка (клиентский поиск); карточке — её фрагмент
        content
        ...PostCard_post
      }
      nextCursor
    }
  }
`);

// тип результата запроса (items — замаскированные ссылки на фрагмент PostCard_post)
export type FeedResult = DocumentType<typeof FeedQuery>;

// QueryRef ленты (общий тип для useFeed и FeedList). errorPolicy дефолтный →
// на ошибке запрос бросает (ловит ErrorBoundary), а не отдаёт пустые данные,
// поэтому состояние "empty" в типе не нужно.
export type FeedQueryRef = QueryRef.ForQuery<typeof FeedQuery>;
