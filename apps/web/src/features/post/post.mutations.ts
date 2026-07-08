import { graphql } from "../../gql";

// react/unreact возвращают Boolean, а не обновлённый Post — поэтому кэш после
// них правится вручную (cache.modify в LikeButton), автозаписи не будет
export const ReactDoc = graphql(`
  mutation React($postId: ID!, $type: ReactionType!) {
    react(postId: $postId, type: $type)
  }
`);

export const UnreactDoc = graphql(`
  mutation Unreact($postId: ID!) {
    unreact(postId: $postId)
  }
`);

// addComment возвращает сущность — Apollo нормализует её в Comment:<id>,
// а в список поста её дописывает update-колбэк мутации
export const AddCommentDoc = graphql(`
  mutation AddComment($postId: ID!, $content: String!) {
    addComment(postId: $postId, content: $content) {
      id
      content
      createdAt
      author {
        id
        username
        displayName
        avatarUrl
      }
    }
  }
`);
