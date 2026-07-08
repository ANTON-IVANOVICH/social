import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { ApolloProvider } from "@apollo/client/react";
import { Button } from "@heroui/react";
import { apolloClient } from "./shared/apollo/client";
import { initCache } from "./shared/apollo/cache";
import { report } from "./shared/observability/report";
import { router } from "./app/router";
import { AuthProvider, resetSession } from "./features/auth/AuthProvider";
import { ErrorBoundary } from "./shared/ui/ErrorBoundary";
import { Splash } from "./app/Splash";
import { initTheme } from "./shared/theme/useTheme";
import "./index.css";

// Корневые обработчики ошибок React 19 (передаются в createRoot):
// onUncaughtError — ошибку не поймала НИ одна ErrorBoundary (баг → fatal-лог),
// onCaughtError — граница перехватила (деградировали корректно, но знать надо).
// Гранулярность (какие узлы изолированы) задают сами ErrorBoundary в дереве.
const onCaughtError = (error: unknown, info: { componentStack?: string }) =>
  report(error, info.componentStack);
const onUncaughtError = (error: unknown, info: { componentStack?: string }) =>
  report(error, info.componentStack, { fatal: true });

async function bootstrap(): Promise<void> {
  initTheme(); // применяем тему до первого рендера (без вспышки)

  // react-scan — только в dev и ДО рендера: визуализирует лишние ререндеры,
  // помогает убедиться, что React Compiler реально мемоизирует компоненты
  if (import.meta.env.DEV) {
    const { scan } = await import("react-scan");
    scan({ enabled: true });
  }

  // восстанавливаем нормализованный кэш из localStorage ДО первого рендера,
  // чтобы cache-first-запросы сразу отдали сохранённые данные (мгновенный старт)
  await initCache();

  createRoot(document.getElementById("root")!, {
    onCaughtError,
    onUncaughtError,
  }).render(
    <StrictMode>
      {/* ApolloProvider выше роутера → хуки доступны на любом маршруте.
          ErrorBoundary НАД AuthProvider ловит сбой bootstrap'а (use() бросает, а
          Suspense ошибки не ловит) — повтор сбрасывает сессию и пробует заново.
          <Suspense> обязан быть НАД AuthProvider: тот саспендит на bootstrap-сессии. */}
      <ApolloProvider client={apolloClient}>
        <ErrorBoundary
          fallback={(error, reset) => (
            <div className="flex min-h-screen flex-col items-center justify-center gap-3">
              <div className="text-danger">
                Не удалось запустить приложение: {error.message}
              </div>
              <Button
                variant="ghost"
                onPress={() => {
                  resetSession();
                  reset();
                }}
              >
                Повторить
              </Button>
            </div>
          )}
        >
          <Suspense fallback={<Splash />}>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </Suspense>
        </ErrorBoundary>
      </ApolloProvider>
    </StrictMode>,
  );
}

void bootstrap();
