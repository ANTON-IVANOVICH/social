import { Avatar } from "@heroui/react";
import { getFragmentData, type FragmentType } from "../../gql";
import { NotificationParts } from "./notifications.graphql";

export function NotificationItem({
  notification,
}: {
  notification: FragmentType<typeof NotificationParts>;
}) {
  const n = getFragmentData(NotificationParts, notification);

  // TS сужает тип по __typename — каждая ветка видит строго свои поля, без as-кастов
  switch (n.__typename) {
    case "FollowNotification":
      return (
        <Row
          avatar={n.follower.avatarUrl}
          name={n.follower.username}
          text={`@${n.follower.username} подписался на вас`}
        />
      );
    case "ReactionNotification":
      return (
        <Row
          avatar={n.actor.avatarUrl}
          name={n.actor.username}
          text={`@${n.actor.username} отреагировал на ваш пост`}
        />
      );
    case "CommentNotification":
      return (
        <Row
          avatar={n.actor.avatarUrl}
          name={n.actor.username}
          text={`@${n.actor.username} прокомментировал ваш пост`}
        />
      );
    default:
      return null;
  }
}

function Row({
  avatar,
  name,
  text,
}: {
  avatar?: string | null;
  name: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-default-200 p-3">
      <Avatar size="sm">
        <Avatar.Image src={avatar ?? undefined} alt={name} />
        <Avatar.Fallback>{name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      </Avatar>
      <span className="text-sm">{text}</span>
    </div>
  );
}
