import { Link, Outlet } from "react-router";
import { Button } from "@heroui/react";
import { useTheme } from "../shared/theme/useTheme";

export function Layout() {
  const { theme, toggle } = useTheme();
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
        <Outlet />
      </main>
    </div>
  );
}
