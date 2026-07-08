import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import { RequireAuth } from "./RequireAuth";
import { HomeRoute } from "../features/feed/HomeRoute";
import { ProfilePage } from "../features/profile/ProfilePage";
import { LoginForm } from "../features/auth/LoginForm";
import { RegisterForm } from "../features/auth/RegisterForm";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: (
          <RequireAuth>
            <HomeRoute />
          </RequireAuth>
        ),
      },
      { path: "u/:username", element: <ProfilePage /> }, // публичный профиль
      { path: "login", element: <LoginForm /> },
      { path: "register", element: <RegisterForm /> },
    ],
  },
]);
