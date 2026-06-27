import { createClient } from "graphql-ws";
import { tokenStore } from "../auth/token-store";
import { refreshSession } from "../auth/refresh";
import { notifySessionExpired } from "../auth/auth-events";

export const wsClient = createClient({
  url: import.meta.env.VITE_WS_URL, // ws://localhost:3000/graphql
  lazy: true, // соединение открывается только когда есть подписка

  // connectionParams — ФУНКЦИЯ: вызывается при каждом (пере)подключении и читает
  // токен лениво. async — чтобы при отсутствующем access обновить его ПЕРЕД connect:
  // бэкенд валидирует JWT один раз в onConnect, поэтому при reconnect нужен свежий.
  connectionParams: async () => {
    let token = tokenStore.getAccess();
    if (!token) token = await refreshSession();
    if (!token) {
      // refresh не удался → сессия мертва. Сигналим (logout + redirect на /login),
      // иначе onConnect отклонит и мы зависнем в молчаливых ретраях. Размонтирование
      // подписок при logout остановит WS (lazy), так что цикл ретраев прервётся.
      notifySessionExpired();
      return {};
    }
    return { authorization: `Bearer ${token}` };
  },

  shouldRetry: () => true, // переподключаемся при обрыве
});

// Тихий refresh сменил access-токен → пересоздаём соединение, чтобы onConnect
// получил свежий токен (connectionParams читается при следующем connect). clear()
// шлёт null — тогда не трогаем (logout закрывает WS сам через terminate()).
tokenStore.subscribe((token) => {
  if (token) wsClient.terminate();
});
