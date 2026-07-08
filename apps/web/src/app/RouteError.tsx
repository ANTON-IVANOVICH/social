import { isRouteErrorResponse, useRouteError, Link } from "react-router";
import { Button } from "@heroui/react";

// Граница ошибок УРОВНЯ МАРШРУТА. Ошибки в route.lazy() (например, 404 на чанк
// после нового деплоя — «Failed to fetch dynamically imported module») React
// Router разруливает в своей фазе навигации, а НЕ через React-ErrorBoundary,
// поэтому компонентные границы их не ловят. Без errorElement RR показал бы
// голый «Unexpected Application Error» ВМЕСТО всего приложения. Этот элемент
// рендерится внутри <Outlet> каркаса, сохраняя шапку/навигацию, и даёт починку.
export function RouteError() {
  const error = useRouteError();

  const is404 =
    isRouteErrorResponse(error) && error.status === 404;
  // типичная причина не-404 — устаревший бандл после деплоя (чанк перехэширован)
  const isChunkError =
    error instanceof Error && /dynamically imported module|Failed to fetch/i.test(error.message);

  const message = is404
    ? "Страница не найдена"
    : isChunkError
      ? "Приложение обновилось — перезагрузите страницу"
      : "Что-то пошло не так при загрузке страницы";

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-3 p-8">
      <h1 className="text-lg font-semibold">{message}</h1>
      {error instanceof Error && !isChunkError && (
        <p className="text-default-500 text-sm">{error.message}</p>
      )}
      <div className="flex gap-3">
        {/* перезагрузка гарантированно подтянет свежий бандл (чинит chunk-404) */}
        <Button variant="primary" onPress={() => window.location.reload()}>
          Перезагрузить
        </Button>
        <Link to="/" className="text-primary hover:underline">
          На главную
        </Link>
      </div>
    </div>
  );
}
