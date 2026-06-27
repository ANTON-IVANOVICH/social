import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@apollo/client/react";
import { apolloClient } from "../../shared/apollo/client";
import { tokenStore } from "../../shared/auth/token-store";
import { refreshSession } from "../../shared/auth/refresh";
import { onSessionExpired } from "../../shared/auth/auth-events";
import { LoginDoc, LogoutDoc, MeDoc, RegisterDoc } from "./auth.graphql";

type CurrentUser = { id: string; username: string; role: string } | null;

interface AuthValue {
  user: CurrentUser;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const CurrentUserContext = createContext<AuthValue | null>(null);

// Создаётся ОДИН раз (на уровне модуля), чтобы use() получал стабильный промис —
// иначе каждый рендер плодил бы новый и подвешивал дерево бесконечно.
let sessionPromise: Promise<CurrentUser> | null = null;
function getSessionPromise(): Promise<CurrentUser> {
  // НЕ кэшируем отклонённый промис: иначе use() переисповал бы ту же ошибку на
  // каждом рендере без шанса восстановиться. На reject — сбрасываем синглтон.
  sessionPromise ??= bootstrapSession().catch((e: unknown) => {
    sessionPromise = null;
    throw e;
  });
  return sessionPromise;
}

// сброс bootstrap-сессии для повтора (используется app-level error-boundary)
export function resetSession(): void {
  sessionPromise = null;
}

async function bootstrapSession(): Promise<CurrentUser> {
  // при перезагрузке access потерян; refresh лежит в httpOnly-cookie и из JS не
  // виден — поэтому просто пытаемся тихо обновить токен. Нет cookie → null.
  const access = await refreshSession();
  if (!access) return null;
  try {
    const { data } = await apolloClient.query({
      query: MeDoc,
      fetchPolicy: "network-only",
    });
    return data?.me ?? null;
  } catch {
    // транзиентный сбой me на старте → считаем разлогиненным (а не падаем белым
    // экраном): RequireAuth уведёт на /login, пользователь зайдёт заново
    tokenStore.clear();
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // use(Promise): САСПЕНДИТ дерево, пока сессия не определена (один раз при старте)
  const initialUser = use(getSessionPromise());
  const [user, setUser] = useState<CurrentUser>(initialUser);

  const [loginMutation] = useMutation(LoginDoc);
  const [registerMutation] = useMutation(RegisterDoc);
  const [logoutMutation] = useMutation(LogoutDoc);

  // «refresh не удался» на рантайме → чистим сессию; RequireAuth уведёт на /login
  useEffect(
    () =>
      onSessionExpired(() => {
        tokenStore.clear();
        setUser(null);
      }),
    [],
  );

  const login = async (username: string, password: string) => {
    const { data } = await loginMutation({
      variables: { input: { username, password } },
    });
    const payload = data!.login;
    tokenStore.setAccess(payload.tokens.accessToken); // refresh — в httpOnly-cookie
    setUser(payload.user);
  };

  const register = async (
    username: string,
    password: string,
    displayName?: string,
  ) => {
    await registerMutation({
      variables: {
        input: { username, password, ...(displayName ? { displayName } : {}) },
      },
    });
    await login(username, password); // после регистрации сразу логиним
  };

  const logout = async () => {
    // бэкенд читает refresh из cookie, отзывает его и чистит cookie (access — из authLink)
    await logoutMutation().catch(() => {});
    tokenStore.clear();
    setUser(null);
    await apolloClient.clearStore(); // вычищаем кэш от данных прошлого пользователя
  };

  // React Compiler сам стабилизирует идентичности — ручных useMemo/useCallback нет.
  // React 19: контекст-как-провайдер, без .Provider
  return (
    <CurrentUserContext value={{ user, login, register, logout }}>
      {children}
    </CurrentUserContext>
  );
}

// use(Context) — как useContext, но можно вызывать условно (после ранних return)
export function useAuth(): AuthValue {
  const ctx = use(CurrentUserContext);
  if (!ctx) throw new Error("useAuth вне AuthProvider");
  return ctx;
}
