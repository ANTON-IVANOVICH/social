import { useRef, useState } from "react";
import { useMutation, useSubscription } from "@apollo/client/react";
import { Input } from "@heroui/react";
import { SetTypingDoc, TypingSub } from "./presence.graphql";

export function TypingIndicator({ postId }: { postId: string }) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  useSubscription(TypingSub, {
    variables: { postId },
    onData: ({ data }) => {
      const ev = data.data?.typing; // бэкенд не шлёт событие самому набирающему
      if (!ev) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (ev.isTyping) next.add(ev.userId);
        else next.delete(ev.userId);
        return next;
      });
    },
  });

  return typingUsers.size > 0 ? (
    <div className="px-1 text-xs text-default-500">Кто-то печатает…</div>
  ) : null;
}

// поле комментария с дебаунсом статуса набора (typing эфемерен, нигде не кэшируется)
export function CommentBox({ postId }: { postId: string }) {
  const [setTyping] = useMutation(SetTypingDoc);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onInput = () => {
    void setTyping({ variables: { postId, isTyping: true } });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void setTyping({ variables: { postId, isTyping: false } });
    }, 1500);
  };

  return (
    <div className="mt-2">
      <TypingIndicator postId={postId} />
      <Input placeholder="Комментарий…" onInput={onInput} />
    </div>
  );
}
