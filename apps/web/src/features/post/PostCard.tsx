import { Avatar, Card } from "@heroui/react";
import { getFragmentData, type FragmentType } from "../../gql";
import { PostCardFragment } from "./post.fragments";
import { useOnline } from "../presence/PresenceProvider";
import { CommentBox } from "../presence/TypingIndicator";

// Проп — «замаскированная» ссылка на фрагмент, а не сырой объект. getFragmentData
// разворачивает её и отдаёт СТРОГО поля фрагмента — компонент самодостаточен.
export function PostCard({
  post,
}: {
  post: FragmentType<typeof PostCardFragment>;
}) {
  const p = getFragmentData(PostCardFragment, post);
  const isOnline = useOnline();

  return (
    <Card className="mb-3">
      <Card.Header className="flex items-center gap-3">
        <div className="relative">
          <Avatar size="sm">
            <Avatar.Image
              src={p.author.avatarUrl ?? undefined}
              alt={p.author.username}
            />
            <Avatar.Fallback>
              {p.author.username.slice(0, 2).toUpperCase()}
            </Avatar.Fallback>
          </Avatar>
          {isOnline(p.author.id) && (
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-background" />
          )}
        </div>
        <span className="font-medium">
          {p.author.displayName ?? p.author.username}
        </span>
      </Card.Header>
      <Card.Content>{p.content}</Card.Content>
      <Card.Footer className="flex-col items-stretch gap-2">
        <div className="text-default-500 text-sm">
          ❤️ {p.reactionCount} · 💬 {p.commentCount}
        </div>
        {/* поле комментария шлёт сигнал набора (typing) и показывает индикатор */}
        <CommentBox postId={p.id} />
      </Card.Footer>
    </Card>
  );
}
