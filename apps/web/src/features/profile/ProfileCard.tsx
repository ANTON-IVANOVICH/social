import { Avatar, Card } from "@heroui/react";
import type { ProfileUser } from "./profile.graphql";

// Презентационная карточка: данные запрашивает страница (ProfilePage), карточка
// только рисует — так title/meta и карточка питаются одним ответом.
export function ProfileCard({ user: u }: { user: ProfileUser }) {
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
      {u.bio && <Card.Content className="text-sm">{u.bio}</Card.Content>}
    </Card>
  );
}
