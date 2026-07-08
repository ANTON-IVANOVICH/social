import { useEffect, useRef, useState } from "react";
import { useSubscription } from "@apollo/client/react";
import { TypingSub } from "./presence.graphql";

// TTL на каждого печатающего: isTyping:false может не дойти вовсе (обрыв сети,
// закрытая вкладка) — без локального таймера индикатор завис бы навсегда.
// Пока человек печатает, его клиент шлёт isTyping:true и TTL продлевается.
const TYPING_TTL_MS = 4000;

export function TypingIndicator({ postId }: { postId: string }) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const drop = (userId: string) => {
    clearTimeout(timers.current.get(userId));
    timers.current.delete(userId);
    setTypingUsers((prev) => {
      if (!prev.has(userId)) return prev;
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  };

  useSubscription(TypingSub, {
    variables: { postId },
    onData: ({ data }) => {
      const ev = data.data?.typing; // бэкенд не шлёт событие самому набирающему
      if (!ev) return;
      if (!ev.isTyping) {
        drop(ev.userId);
        return;
      }
      clearTimeout(timers.current.get(ev.userId));
      timers.current.set(
        ev.userId,
        setTimeout(() => drop(ev.userId), TYPING_TTL_MS),
      );
      setTypingUsers((prev) =>
        prev.has(ev.userId) ? prev : new Set(prev).add(ev.userId),
      );
    },
  });

  // на размонтировании гасим все TTL-таймеры (setState после unmount не нужен)
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  return typingUsers.size > 0 ? (
    <div className="px-1 text-xs text-default-500">Кто-то печатает…</div>
  ) : null;
}
