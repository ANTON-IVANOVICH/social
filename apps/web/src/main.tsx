import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { ApolloProvider } from "@apollo/client/react";
import { Button } from "@heroui/react";
import { apolloClient } from "./shared/apollo/client";
import { router } from "./app/router";
import { AuthProvider, resetSession } from "./features/auth/AuthProvider";
import { ErrorBoundary } from "./shared/ui/ErrorBoundary";
import { Splash } from "./app/Splash";
import { initTheme } from "./shared/theme/useTheme";
import "./index.css";

initTheme(); // применяем тему до первого рендера (без вспышки)

createRoot(document.getElementById("root")!).render(
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
