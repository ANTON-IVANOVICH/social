import { type DocumentType, graphql } from "../../gql";

// Единый документ профиля: и страница (title/meta), и карточка читают его —
// одинаковый запрос Apollo дедуплицирует, сеть дёргается один раз.
// Поле user(username) — публичное, работает без токена.
export const UserQuery = graphql(`
  query User($username: String!) {
    user(username: $username) {
      id
      username
      displayName
      bio
      avatarUrl
    }
  }
`);

export type ProfileUser = NonNullable<DocumentType<typeof UserQuery>["user"]>;
