import { Suspense } from "react";
import { Link, useParams } from "react-router";
import { useSuspenseQuery } from "@apollo/client/react";
import { Avatar, Card, Skeleton } from "@heroui/react";
import { graphql } from "../../gql";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { LikeButton } from "./LikeButton";
import { CommentThread } from "../comments/CommentThread";

// Быстрые поля поста — БЕЗ comments. У бэкенда graphql@16, где директивы @defer
// нет (апгрейд к alpha-графу исключён), поэтому «контент сразу, комментарии
// потоком» реализуем не серверным @defer, а РАЗДЕЛЕНИЕМ на два запроса:
// шапка поста грузится здесь и показывается мгновенно, а ветку комментариев
// тянет отдельным запросом CommentThread (её useQuery — второй, «отложенный»,
// round-trip). Эффект для пользователя тот же: тело поста не ждёт комментариев.
const PostPageQuery = graphql(`
  query PostPage($id: ID!) {
    post(id: $id) {
      id
      content
      createdAt
      reactionCount
      myReaction
      author {
        id
        username
        displayName
        avatarUrl
      }
    }
  }
`);

export function PostPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ErrorBoundary>
      <Suspense fallback={<Skeleton className="mx-auto my-6 h-40 w-full max-w-xl rounded-lg" />}>
        <PostContent id={id ?? ""} />
      </Suspense>
    </ErrorBoundary>
  );
}

function PostContent({ id }: { id: string }) {
  // suspense-запрос шапки: loading ловит <Suspense> выше, ошибка — ErrorBoundary
  // на ошибке useSuspenseQuery бросает → ловит ErrorBoundary выше (errorPolicy
  // дефолтный); null тут — это именно «поста нет», а не сетевой сбой
  const { data } = useSuspenseQuery(PostPageQuery, { variables: { id } });
  const post = data.post;

  if (!post) return <div className="m-6">Пост не найден</div>;

  return (
    <article className="mx-auto max-w-xl p-4">
      <Card>
        <Card.Header className="flex items-center gap-3">
          <Avatar size="sm">
            <Avatar.Image
              src={post.author.avatarUrl ?? undefined}
              alt={post.author.username}
            />
            <Avatar.Fallback>
              {post.author.username.slice(0, 2).toUpperCase()}
            </Avatar.Fallback>
          </Avatar>
          <Link
            to={`/u/${post.author.username}`}
            className="font-medium hover:underline"
          >
            {post.author.displayName ?? post.author.username}
          </Link>
        </Card.Header>
        <Card.Content>{post.content}</Card.Content>
        <Card.Footer className="flex-col items-stretch gap-3">
          <LikeButton
            postId={post.id}
            myReaction={post.myReaction ?? null}
            reactionCount={post.reactionCount}
          />
          {/* отдельный запрос — «отложенная» часть страницы */}
          <CommentThread postId={post.id} />
        </Card.Footer>
      </Card>
    </article>
  );
}
