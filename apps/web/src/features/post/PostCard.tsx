import { useState } from "react";
import { preload } from "react-dom";
import { Link } from "react-router";
import { Avatar, Button, Card } from "@heroui/react";
import { getFragmentData, type FragmentType } from "../../gql";
import { PostCardFragment } from "./post.fragments";
import { LikeButton } from "./LikeButton";
import { CommentThread } from "../comments/CommentThread";
import { useOnline } from "../presence/PresenceProvider";

// Проп — «замаскированная» ссылка на фрагмент, а не сырой объект. getFragmentData
// разворачивает её и отдаёт СТРОГО поля фрагмента — компонент самодостаточен.
export function PostCard({
  post,
}: {
  post: FragmentType<typeof PostCardFragment>;
}) {
  const p = getFragmentData(PostCardFragment, post);
  const isOnline = useOnline();
  // ветка комментариев разворачивается по клику — её запрос и живые подписки
  // (commentAdded/reactionAdded) живут только пока пост «открыт»
  const [showComments, setShowComments] = useState(false);

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
        {/* preload при наведении греет аватар до перехода на профиль;
            React дедуплицирует повторные вызовы — можно звать свободно */}
        <Link
          to={`/u/${p.author.username}`}
          className="font-medium hover:underline"
          onMouseEnter={() => {
            if (p.author.avatarUrl) preload(p.author.avatarUrl, { as: "image" });
          }}
        >
          {p.author.displayName ?? p.author.username}
        </Link>
      </Card.Header>
      <Card.Content>{p.content}</Card.Content>
      <Card.Footer className="flex-col items-stretch gap-2">
        <div className="flex items-center gap-2">
          <LikeButton
            postId={p.id}
            myReaction={p.myReaction ?? null}
            reactionCount={p.reactionCount}
          />
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setShowComments((open) => !open)}
          >
            💬 {p.commentCount}
          </Button>
          {/* пермалинк на отдельную страницу поста (ленивый чанк p/:id) */}
          <Link
            to={`/p/${p.id}`}
            className="ml-auto text-sm text-default-500 hover:underline"
          >
            Открыть
          </Link>
        </div>
        {showComments && <CommentThread postId={p.id} />}
      </Card.Footer>
    </Card>
  );
}
