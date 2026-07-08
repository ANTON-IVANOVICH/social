import { Suspense } from "react";
import { useParams } from "react-router";
import { useSuspenseQuery } from "@apollo/client/react";
import { Skeleton } from "@heroui/react";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { useAuth } from "../auth/AuthProvider";
import { UserQuery } from "./profile.graphql";
import { ProfileCard } from "./ProfileCard";
import { AvatarUpload } from "./AvatarUpload";

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  return (
    <ErrorBoundary>
      <Suspense fallback={<Skeleton className="m-6 h-24 w-80 rounded-lg" />}>
        <ProfileContent username={username ?? ""} />
      </Suspense>
    </ErrorBoundary>
  );
}

function ProfileContent({ username }: { username: string }) {
  // suspense-запрос: loading ловит <Suspense> выше, ошибка — ErrorBoundary
  const { data } = useSuspenseQuery(UserQuery, { variables: { username } });
  const { user: me } = useAuth();
  const u = data.user;

  if (!u) return <div className="m-6">Пользователь не найден</div>;

  return (
    <>
      {/* React 19 сам поднимает title/meta из любого места дерева в <head> —
          заголовок вкладки и описание меняются на маршруте профиля без библиотек */}
      <title>{`${u.displayName ?? u.username} — Соцсеть`}</title>
      <meta name="description" content={u.bio ?? `Профиль @${u.username}`} />

      <ProfileCard user={u} />
      {/* сменить аватар можно только себе (мутация и так пишет по токену) */}
      {me?.username === u.username && <AvatarUpload />}
    </>
  );
}
