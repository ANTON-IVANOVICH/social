import { graphql } from "../../gql";

// Фрагмент колокейтится с компонентом: PostCard описывает нужные ему поля рядом
// с собой, а любой запрос, который его спредит, codegen свяжет автоматически.
export const PostCardFragment = graphql(`
  fragment PostCard_post on Post {
    id
    content
    createdAt
    reactionCount
    commentCount
    author {
      id
      username
      displayName
      avatarUrl
    }
  }
`);
