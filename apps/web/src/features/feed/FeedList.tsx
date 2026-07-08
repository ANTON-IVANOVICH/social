import { useTransition } from "react";
import { useReadQuery } from "@apollo/client/react";
import { Button } from "@heroui/react";
import { SearchableFeed } from "./SearchableFeed";
import { type FeedQueryRef } from "./feed.graphql";

export function FeedList({
  queryRef,
  loadMore,
}: {
  queryRef: FeedQueryRef;
  loadMore: (cursor: string) => Promise<unknown>;
}) {
  // useReadQuery саспендит ТОЛЬКО этот компонент, пока данных нет; на ошибке
  // бросает → ловит ErrorBoundary в HomeRoute (с ретраем через refetch)
  const { data } = useReadQuery(queryRef);
  const { items, nextCursor } = data.feed;
  // isPending блокирует кнопку на время догрузки — иначе двойной клик дописал бы
  // ту же страницу второй раз (тот же cursor) и продублировал бы посты
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mx-auto max-w-xl p-4">
      <SearchableFeed items={items} />
      {nextCursor && (
        <Button
          variant="outline"
          className="w-full"
          isDisabled={isPending}
          onPress={() =>
            // startTransition: НЕ показываем fallback, держим старый список во
            // время догрузки → плавная бесконечная лента вместо мигания скелетоном
            startTransition(() => {
              void loadMore(nextCursor);
            })
          }
        >
          {isPending ? "Загрузка…" : "Загрузить ещё"}
        </Button>
      )}
    </div>
  );
}
