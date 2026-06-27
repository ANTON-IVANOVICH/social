import { Avatar, Card } from "@heroui/react";
import { getFragmentData, type FragmentType } from "../../gql";
import { PostCardFragment } from "./post.fragments";

// Проп — «замаскированная» ссылка на фрагмент, а не сырой объект. getFragmentData
// разворачивает её и отдаёт СТРОГО поля фрагмента — компонент самодостаточен.
export function PostCard({
  post,
}: {
  post: FragmentType<typeof PostCardFragment>;
}) {
  const p = getFragmentData(PostCardFragment, post);

  return (
    <Card className="mb-3">
      <Card.Header className="flex items-center gap-3">
        <Avatar size="sm">
          <Avatar.Image
            src={p.author.avatarUrl ?? undefined}
            alt={p.author.username}
          />
          <Avatar.Fallback>
            {p.author.username.slice(0, 2).toUpperCase()}
          </Avatar.Fallback>
        </Avatar>
        <span className="font-medium">
          {p.author.displayName ?? p.author.username}
        </span>
      </Card.Header>
      <Card.Content>{p.content}</Card.Content>
      <Card.Footer className="text-default-500 text-sm">
        ❤️ {p.reactionCount} · 💬 {p.commentCount}
      </Card.Footer>
    </Card>
  );
}
