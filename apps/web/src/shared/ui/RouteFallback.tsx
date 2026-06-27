import { Skeleton } from "@heroui/react";

// Фолбэк для <Suspense> на уровне маршрута: пока suspense-хуки грузят
// данные, показываем скелетоны вместо ручных проверок loading в компонентах.
export function RouteFallback() {
  return (
    <div className="m-6 flex flex-col gap-3">
      <Skeleton className="h-24 w-80 rounded-lg" />
      <Skeleton className="h-24 w-80 rounded-lg" />
    </div>
  );
}
