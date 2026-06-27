import { useQuery } from "@apollo/client/react";
import { Avatar, Card, Skeleton } from "@heroui/react";
import { graphql } from "../../gql"; // сгенерировано codegen'ом (yarn codegen)

// Типизированный документ: типы переменных и данных выводятся автоматически.
// Поле user(username) — публичное (бэкенд-Этап 3), поэтому работает без токена.
const UserQuery = graphql(`
  query User($username: String!) {
    user(username: $username) {
      id
      username
      displayName
      avatarUrl
    }
  }
`);

export function ProfileCard({ username }: { username: string }) {
  const { data, loading, error } = useQuery(UserQuery, {
    variables: { username },
  });

  if (loading) return <Skeleton className="m-6 h-24 w-80 rounded-lg" />;
  if (error)
    return <div className="m-6 text-danger">Ошибка: {error.message}</div>;
  if (!data?.user) return <div className="m-6">Пользователь не найден</div>;

  const u = data.user;
  return (
    <Card className="m-6 max-w-80">
      <Card.Header className="flex items-center gap-3">
        {/* HeroUI v3 Avatar — компаунд: Image + Fallback (инициалы) */}
        <Avatar>
          <Avatar.Image src={u.avatarUrl ?? undefined} alt={u.username} />
          <Avatar.Fallback>
            {u.username.slice(0, 2).toUpperCase()}
          </Avatar.Fallback>
        </Avatar>
        <div>
          <div className="font-semibold">{u.displayName ?? u.username}</div>
          <div className="text-default-500">@{u.username}</div>
        </div>
      </Card.Header>
    </Card>
  );
}
