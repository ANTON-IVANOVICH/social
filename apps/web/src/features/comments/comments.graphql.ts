import { graphql } from "../../gql";

// read-path ветки: комментарии живут полем поста, поэтому попадают в его
// нормализованную запись Post:<id> — все правки (мутация, подписка) видны везде
export const PostCommentsQuery = graphql(`
  query PostComments($id: ID!) {
    post(id: $id) {
      id
      commentCount
      comments {
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
  }
`);

// «события на странице»: чужие комментарии к развёрнутому посту
export const CommentAddedSub = graphql(`
  subscription CommentAdded($postId: ID!) {
    commentAdded(postId: $postId) {
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

// чужие реакции на развёрнутый пост (бэкенд шлёт событие только на НОВУЮ реакцию)
export const ReactionAddedSub = graphql(`
  subscription ReactionAdded($postId: ID!) {
    reactionAdded(postId: $postId) {
      postId
      userId
      type
    }
  }
`);
