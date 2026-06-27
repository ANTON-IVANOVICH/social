import { type DocumentType, graphql } from "../../gql";

// Запрос ленты спредит фрагмент PostCard_post (определён в post.fragments.ts).
// codegen статически сканирует src/**/*.{ts,tsx}, находит фрагмент и инлайнит его
// в документ — runtime-импорт не нужен. masking отдаёт каждому PostCard свои поля.
export const FeedQuery = graphql(`
  query Feed($cursor: String) {
    feed(limit: 20, cursor: $cursor) {
      items {
        id
        ...PostCard_post
      }
      nextCursor
    }
  }
`);

// тип результата запроса (items — замаскированные ссылки на фрагмент PostCard_post)
export type FeedResult = DocumentType<typeof FeedQuery>;
