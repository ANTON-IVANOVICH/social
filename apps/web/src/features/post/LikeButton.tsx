import type { ApolloCache } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { Button } from "@heroui/react";
import type { ReactionType } from "../../gql/graphql";
import { ReactDoc, UnreactDoc } from "./post.mutations";

// Оптимистичный лайк: optimisticResponse даёт «ответ» мгновенно, update правит
// кэш через cache.modify. Update выполняется дважды — на оптимистичном слое
// (сразу) и на реальном кэше (после ответа, оптимистичный слой откатывается);
// счётчик считается ОТ ТЕКУЩЕГО значения (n + delta), поэтому не двоится.
// Правка идёт в нормализованную запись Post:<id> — видна во всех вьюхах сразу.
export function LikeButton({
  postId,
  myReaction,
  reactionCount,
}: {
  postId: string;
  myReaction: ReactionType | null;
  reactionCount: number;
}) {
  const [react] = useMutation(ReactDoc);
  const [unreact] = useMutation(UnreactDoc);
  const liked = myReaction != null; // моя реакция любого типа = «сердце залито»

  const toggle = () => {
    if (liked) {
      void unreact({
        variables: { postId },
        optimisticResponse: { unreact: true },
        update: (cache) => bump(cache, postId, -1, null),
      });
    } else {
      // ReactionType сгенерирован юнионом строковых литералов — "LIKE" типобезопасен
      void react({
        variables: { postId, type: "LIKE" },
        optimisticResponse: { react: true },
        update: (cache) => bump(cache, postId, +1, "LIKE"),
      });
    }
  };

  return (
    <Button size="sm" variant={liked ? "danger" : "ghost"} onPress={toggle}>
      ❤️ {reactionCount}
    </Button>
  );
}

function bump(
  cache: ApolloCache,
  postId: string,
  delta: number,
  reaction: ReactionType | null,
) {
  cache.modify({
    id: cache.identify({ __typename: "Post", id: postId }),
    fields: {
      reactionCount: (n) => Math.max(0, (n as number) + delta),
      myReaction: () => reaction,
    },
  });
}
