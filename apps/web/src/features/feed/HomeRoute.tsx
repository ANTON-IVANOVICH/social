import { Suspense } from "react";
import { Button } from "@heroui/react";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { FeedList } from "./FeedList";
import { FeedSkeleton } from "./FeedSkeleton";
import { useFeed } from "./useFeed";

export function HomeRoute() {
  // дата-слой ленты инкапсулирован в useFeed: запрос стартует СРАЗУ, но страница
  // НЕ саспендит — shell рисуется мгновенно, саспендит только FeedList
  const { queryRef, loadMore, refetch } = useFeed();

  return (
    <div className="flex gap-6">
      {/* сайдбар рисуется не дожидаясь ленты */}
      <aside className="hidden w-64 p-4 lg:block" />
      {/* при ошибке загрузки queryRef держит отклонённый промис, поэтому простой
          reset снова бросит ту же ошибку — повтор должен ВЫЗВАТЬ refetch (он
          заменяет промис на новый pending), а затем сбросить границу */}
      <ErrorBoundary
        fallback={(error, reset) => (
          <div className="m-6 flex flex-col items-start gap-3">
            <div className="text-danger">
              Не удалось загрузить ленту: {error.message}
            </div>
            <Button
              variant="ghost"
              onPress={() => {
                void refetch();
                reset();
              }}
            >
              Повторить
            </Button>
          </div>
        )}
      >
        <Suspense fallback={<FeedSkeleton />}>
          <FeedList queryRef={queryRef} loadMore={loadMore} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
