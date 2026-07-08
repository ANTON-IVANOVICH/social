import { useEffect } from "react";
import { useBackgroundQuery } from "@apollo/client/react";
import { FeedQuery, type FeedQueryRef, type FeedResult } from "./feed.graphql";
import { PostAddedSub } from "./feed.subscriptions";

export interface UseFeed {
  queryRef: FeedQueryRef;
  loadMore: (cursor: string) => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

// Дата-слой ленты в одном месте: useBackgroundQuery (старт рано, без водопадов),
// пагинация и живая лента через subscribeToMore. Компоненты получают чистый
// queryRef/loadMore вместо сырого fetchMore.
export function useFeed(): UseFeed {
  const [queryRef, { fetchMore, refetch, subscribeToMore }] =
    useBackgroundQuery(FeedQuery);

  useEffect(() => {
    // новые посты подписок дописываются в кэш ленты сверху
    const unsubscribe = subscribeToMore({
      document: PostAddedSub,
      // Apollo 4 типизирует prev как DeepPartial, и при гонке «событие пришло до
      // того, как HTTP-лента записалась в кэш» prev (cache.diff) может быть
      // null/частичным — поэтому проверяем feed?.items перед разыменованием.
      updateQuery: (prevPartial, { subscriptionData }) => {
        const prev = prevPartial as FeedResult | null;
        const post = subscriptionData.data?.postAdded;
        // лента ещё не в кэше (гонка на старте) или нет поста → ничего не меняем
        if (!post || !prev?.feed?.items) return undefined;
        // ДЕДУП: свой же пост прилетит и через мутацию создания, и через подписку
        if (prev.feed.items.some((p) => p.id === post.id)) return prev;
        return {
          ...prev,
          feed: { ...prev.feed, items: [post, ...prev.feed.items] },
        };
      },
    });
    return unsubscribe; // отписка при размонтировании
  }, [subscribeToMore]);

  return {
    queryRef,
    loadMore: (cursor) => fetchMore({ variables: { cursor } }),
    refetch: () => refetch(),
  };
}
