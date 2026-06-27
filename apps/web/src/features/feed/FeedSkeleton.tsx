import { Skeleton } from "@heroui/react";

// Фолбэк <Suspense> для ленты: пока useReadQuery саспендит, показываем скелетоны
export function FeedSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  );
}
