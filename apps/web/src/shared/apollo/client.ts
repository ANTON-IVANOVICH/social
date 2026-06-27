import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

// Ядро Apollo Client 4 импортируется из "@apollo/client", React-биндинги
// (ApolloProvider/useQuery/...) — из "@apollo/client/react".
export const apolloClient = new ApolloClient({
  link: new HttpLink({ uri: import.meta.env.VITE_API_URL }),
  cache: new InMemoryCache(),
  // на Этапе 2 сюда добавятся typePolicies (нормализация, пагинация),
  // на Этапе 3 — цепочка линков (auth + refresh), на Этапе 4 — split с WS.
  devtools: { enabled: import.meta.env.DEV },
});
