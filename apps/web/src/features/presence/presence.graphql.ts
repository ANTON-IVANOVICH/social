import { graphql } from "../../gql";

// typing — «события на странице поста»: бэкенд фильтрует по postId и не шлёт событие
// самому набирающему.
export const TypingSub = graphql(`
  subscription Typing($postId: ID!) {
    typing(postId: $postId) {
      postId
      userId
      isTyping
    }
  }
`);

export const SetTypingDoc = graphql(`
  mutation SetTyping($postId: ID!, $isTyping: Boolean!) {
    setTyping(postId: $postId, isTyping: $isTyping)
  }
`);

// presence — общий онлайн-набор, питаемый счётчиками соединений в Redis
export const PresenceSub = graphql(`
  subscription PresenceChanged {
    presenceChanged {
      userId
      online
    }
  }
`);
