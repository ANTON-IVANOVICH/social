import { useSyncExternalStore } from "react";

const KEY = "theme";
type Theme = "light" | "dark";

function apply(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(KEY, theme);
  // useSyncExternalStore слушает "storage" — событие из localStorage.setItem
  // в ТЕКУЩЕЙ вкладке не стреляет, поэтому будим подписчиков вручную.
  window.dispatchEvent(new Event("storage"));
}

// инициализация до первого рендера (вызывается в main.tsx) — без вспышки темы
export function initTheme(): void {
  const saved = (localStorage.getItem(KEY) as Theme | null) ?? "light";
  apply(saved);
}

function getSnapshot(): Theme {
  return (localStorage.getItem(KEY) as Theme | null) ?? "light";
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore<Theme>(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    getSnapshot,
    () => "light", // серверный снапшот (на будущее для SSR)
  );
  return { theme, toggle: () => apply(theme === "dark" ? "light" : "dark") };
}
