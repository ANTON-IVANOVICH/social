import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

// Страница ленты с бэкенда: PostConnection { items: [Post!]!, nextCursor: String }
interface FeedPage {
  items: readonly unknown[];
  nextCursor: string | null;
  __typename?: string;
}

// Ядро Apollo Client 4 импортируется из "@apollo/client", React-биндинги
// (ApolloProvider/useQuery/...) — из "@apollo/client/react".
export const apolloClient = new ApolloClient({
  link: new HttpLink({ uri: import.meta.env.VITE_API_URL }),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          // Курсорная лента: keyArgs:[] → одна запись в кэше независимо от
          // cursor/limit, а merge СКЛЕИВАЕТ страницы. Без этого fetchMore затирал
          // бы предыдущую страницу.
          feed: {
            keyArgs: [],
            merge(existing: FeedPage | undefined, incoming: FeedPage): FeedPage {
              if (!existing) return incoming;
              return {
                ...incoming,
                items: [...existing.items, ...incoming.items],
              };
            },
          },
        },
      },
    },
    // Post/User нормализуются по умолчанию через __typename + id.
  }),
  // позже — цепочка линков (auth + refresh) и split с WS для подписок.
  devtools: { enabled: import.meta.env.DEV },
});
