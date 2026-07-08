import { Suspense } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router";
import { Button } from "@heroui/react";
import { useTheme } from "../shared/theme/useTheme";
import { useAuth } from "../features/auth/AuthProvider";
import { NotificationBell } from "../features/notifications/NotificationBell";
import { PresenceProvider } from "../features/presence/PresenceProvider";
import { ErrorBoundary } from "../shared/ui/ErrorBoundary";
import { RouteFallback } from "../shared/ui/RouteFallback";

export function Layout() {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // React Router резолвит route.lazy() в фазе навигации (не через Suspense),
  // держа прежний экран смонтированным — <Suspense> в Layout это НЕ покрывает.
  // Тонкая полоса прогресса даёт обратную связь на время загрузки чанка.
  const navigation = useNavigation();

  return (
    <PresenceProvider>
      <div className="min-h-screen bg-background text-foreground">
        {navigation.state === "loading" && (
          <div
            className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary"
            role="progressbar"
            aria-label="Загрузка страницы"
          />
        )}
        <header className="flex items-center justify-between border-b px-6 py-3">
          <Link to="/" className="text-lg font-semibold">
            Соцсеть
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <NotificationBell />
                <span className="text-default-500">@{user.username}</span>
                <Button
                  variant="ghost"
                  onPress={async () => {
                    await logout();
                    navigate("/login");
                  }}
                >
                  Выйти
                </Button>
              </>
            ) : (
              <Button variant="ghost" onPress={() => navigate("/login")}>
                Войти
              </Button>
            )}
            {/* React Aria: onPress, не onClick */}
            <Button variant="ghost" onPress={toggle}>
              {theme === "dark" ? "☀️" : "🌙"}
            </Button>
          </div>
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
    </PresenceProvider>
  );
}
