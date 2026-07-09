import { graphql } from "../../gql";

// Фрагмент на ИНТЕРФЕЙСе Notification + инлайн-фрагменты по конкретным типам —
// фронтовое зеркало InterfaceType + resolveType бэкенда. Один фрагмент в query и
// subscription → данные приходят одинаковой формой.
export const NotificationParts = graphql(`
  fragment NotificationParts on Notification {
    __typename
    id
    read
    createdAt
    ... on FollowNotification {
      follower {
        id
        username
        avatarUrl
      }
    }
    ... on ReactionNotification {
      actor {
        id
        username
        avatarUrl
      }
      post {
        id
      }
    }
    ... on CommentNotification {
      actor {
        id
        username
        avatarUrl
      }
      post {
        id
      }
    }
    ... on MentionNotification {
      actor {
        id
        username
        avatarUrl
      }
      post {
        id
      }
    }
  }
`);

export const NotificationsQuery = graphql(`
  query Notifications {
    notifications {
      ...NotificationParts
    }
  }
`);

export const NewNotificationSub = graphql(`
  subscription NewNotification {
    newNotification {
      ...NotificationParts
    }
  }
`);
