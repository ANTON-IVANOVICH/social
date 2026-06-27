import {
  createContext,
  use,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useSubscription } from "@apollo/client/react";
import { useAuth } from "../auth/AuthProvider";
import { PresenceSub } from "./presence.graphql";

// presence — общий онлайн-набор, питаемый событиями presenceChanged бэкенда
// (счётчики соединений в Redis). Одна подписка на всё приложение через провайдер.
const PresenceContext = createContext<(userId: string) => boolean>(() => false);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const online = useRef<Set<string>>(new Set());
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  // presenceChanged — поток ДЕЛЬТ, не снапшот; провайдер живёт в Layout и не
  // размонтируется при logout/login (навигация клиентская). Поэтому при смене
  // пользователя чистим набор — иначе чужие онлайн-точки «протекли» бы в сессию B.
  useEffect(() => {
    online.current = new Set();
    rerender();
  }, [user?.id]);

  useSubscription(PresenceSub, {
    skip: !user, // подписка только под залогиненным (WS требует токен в connectionParams)
    onData: ({ data }) => {
      const ev = data.data?.presenceChanged;
      if (!ev) return;
      if (ev.online) online.current.add(ev.userId);
      else online.current.delete(ev.userId);
      rerender();
    },
  });

  return (
    <PresenceContext value={(userId) => online.current.has(userId)}>
      {children}
    </PresenceContext>
  );
}

export function useOnline(): (userId: string) => boolean {
  return use(PresenceContext);
}
