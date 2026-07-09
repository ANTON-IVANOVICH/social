// Типы событий, которые кладутся в outbox. Строка — контракт между продюсером
// (обработчик команды) и relayer'ом, поэтому вынесена в общий литерал.
export const OUTBOX_POST_CREATED = "post.created";

// Полезная нагрузка post.created. createdAt едет строкой: payload — JSONB, Date
// в нём не переживает round-trip, а score сортированного набора ленты нужен точный.
export interface PostCreatedOutboxPayload {
  postId: string;
  authorId: string;
  createdAt: string;
}
