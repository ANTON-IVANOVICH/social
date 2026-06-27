import { createBrowserRouter, useParams } from "react-router";
import { Layout } from "./Layout";
import { ProfileCard } from "../features/profile/ProfileCard";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <div className="p-6">Здесь будет лента</div>,
      },
      { path: "u/:username", element: <ProfilePage /> },
    ],
  },
]);

function ProfilePage() {
  // полноценный экран профиля — позже; пока демонстрация типизированного запроса
  const { username } = useParams<{ username: string }>();
  return <ProfileCard username={username ?? ""} />;
}
