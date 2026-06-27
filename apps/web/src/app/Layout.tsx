import { Suspense } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { Button } from "@heroui/react";
import { useTheme } from "../shared/theme/useTheme";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";
import { RouteFallback } from "../shared/ui/RouteFallback";

export function Layout() {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link to="/" className="text-lg font-semibold">
          Соцсеть
        </Link>
        {/* React Aria-конвенция HeroUI: onPress, не onClick (тач/клавиатура/SR) */}
        <Button variant="ghost" onPress={toggle}>
          {theme === "dark" ? "☀️ Светлая" : "🌙 Тёмная"}
        </Button>
      </header>
      <main>
        {/* Единая граница загрузки/ошибок маршрута — фундамент под suspense-хуки.
            key по пути сбрасывает границу ошибок при навигации. */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
