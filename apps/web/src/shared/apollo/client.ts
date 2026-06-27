import {
  ApolloClient,
  CombinedGraphQLErrors,
  HttpLink,
  from,
  split,
} from "@apollo/client";
import { SetContextLink } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { Observable } from "rxjs";
import { cache } from "./cache";
import { wsClient } from "./ws-client";
import { tokenStore } from "../auth/token-store";
import { refreshSession } from "../auth/refresh";
import { notifySessionExpired } from "../auth/auth-events";

// credentials:"include" — браузер шлёт/принимает httpOnly refresh-cookie кросс-ориджин
// (бэкенд в CORS включил credentials и рефлексирует origin в dev)
const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL,
  credentials: "include",
});

// authLink: подставляет access-токен из стора в каждый запрос
const authLink = new SetContextLink((prevContext) => {
  const token = tokenStore.getAccess();
  return {
    headers: {
      ...prevContext.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

// errorLink: на UNAUTHENTICATED обновляет токен и ПОВТОРЯЕТ запрос
const errorLink = new ErrorLink(({ error, operation, forward }) => {
  if (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((e) => e.extensions?.code === "UNAUTHENTICATED")
  ) {
    return new Observable((observer) => {
      refreshSession()
        .then((newAccess) => {
          if (!newAccess) {
            // достигли error-link → запрос был авторизованным, а refresh не удался:
            // сессия истекла. Централизованно разлогиниваем (→ редирект на /login),
            // затем пробрасываем ошибку конкретному запросу.
            notifySessionExpired();
            observer.error(error);
            return;
          }
          // токен уже в сторе; forward пройдёт authLink ПОВТОРНО и подставит новый
          forward(operation).subscribe(observer);
        })
        .catch((e: unknown) => observer.error(e));
    });
  }
  // прочие ошибки не трогаем (возврат void)
  return;
});

// HTTP-цепочка (auth + refresh) применяется ТОЛЬКО к query/mutation.
// ПОРЯДОК ВАЖЕН: errorLink первым → его forward(operation) переисполнит authLink
// с новым токеном (поэтому вручную переписывать заголовок в error-link не нужно).
const httpChain = from([errorLink, authLink, httpLink]);

const wsLink = new GraphQLWsLink(wsClient);

// split на самом верху: подписки идут прямо в WS (своя аутентификация через
// connectionParams), query/mutation — в HTTP-цепочку. Подписки НЕ должны проходить
// HTTP-линки (authLink ставит заголовки, errorLink с refresh-повтором к стриму неприменим).
const link = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === "OperationDefinition" && def.operation === "subscription";
  },
  wsLink,
  httpChain,
);

export const apolloClient = new ApolloClient({
  link,
  cache, // нормализация + field policy для курсорной ленты (см. cache.ts)
  devtools: { enabled: import.meta.env.DEV },
});
