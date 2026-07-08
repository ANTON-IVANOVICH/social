import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import { RequireAuth } from "./RequireAuth";
import { RouteError } from "./RouteError";
import { HomeRoute } from "../features/feed/HomeRoute";

// Code-splitting по маршрутам: главная (нужна сразу) и её RequireAuth — в основном
// бандле, остальное грузится по требованию через route.lazy → Vite выделяет каждый
// динамический import() в отдельный чанк. Стартовый бандл худеет до ленты + каркаса.
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        // Пустой (pathless) маршрут-граница: errorElement ловит ошибки дочерних
        // маршрутов, включая падение route.lazy() (напр. 404 на чанк после деплоя),
        // которые НЕ ловятся компонентными ErrorBoundary. Рендерится внутри <Outlet>
        // каркаса — шапка/навигация сохраняются, есть кнопка перезагрузки.
        errorElement: <RouteError />,
        children: [
          {
            index: true,
            element: (
              <RequireAuth>
                <HomeRoute />
              </RequireAuth>
            ),
          },
          {
            path: "u/:username", // публичный профиль — отдельный чанк
            lazy: () =>
              import("../features/profile/ProfilePage").then((m) => ({
                Component: m.ProfilePage,
              })),
          },
          {
            path: "p/:id", // страница поста — отдельный чанк
            lazy: () =>
              import("../features/post/PostPage").then((m) => ({
                Component: m.PostPage,
              })),
          },
          {
            path: "login",
            lazy: () =>
              import("../features/auth/LoginForm").then((m) => ({
                Component: m.LoginForm,
              })),
          },
          {
            path: "register",
            lazy: () =>
              import("../features/auth/RegisterForm").then((m) => ({
                Component: m.RegisterForm,
              })),
          },
          {
            // catch-all: неизвестный URL → 404 в ту же границу (RouteError),
            // а не голый дефолтный экран React Router
            path: "*",
            loader: () => {
              throw new Response("Not Found", { status: 404 });
            },
          },
        ],
      },
    ],
  },
]);
