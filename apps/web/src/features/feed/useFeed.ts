import { useBackgroundQuery, type QueryRef } from "@apollo/client/react";
import { FeedQuery, type FeedResult } from "./feed.graphql";

export interface UseFeed {
  // queryRef передаётся в FeedList → useReadQuery (саспендит только ленту)
  queryRef: QueryRef<FeedResult>;
  // догрузка следующей страницы по курсору (инкапсулирует форму fetchMore)
  loadMore: (cursor: string) => Promise<unknown>;
  // повторная загрузка (используется для восстановления после ошибки)
  refetch: () => Promise<unknown>;
}

// Дата-слой ленты в одном месте: useBackgroundQuery (старт рано, без водопадов) +
// пагинация. Компоненты получают чистый queryRef/loadMore вместо сырого fetchMore.
// Сюда же позже ляжет subscribeToMore для живых постов.
export function useFeed(): UseFeed {
  const [queryRef, { fetchMore, refetch }] = useBackgroundQuery(FeedQuery);
  return {
    queryRef,
    loadMore: (cursor) => fetchMore({ variables: { cursor } }),
    refetch: () => refetch(),
  };
}
