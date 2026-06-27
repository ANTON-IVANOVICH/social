import { useState } from "react";
import { useQuery, useSubscription } from "@apollo/client/react";
import { Button } from "@heroui/react";
import { getFragmentData } from "../../gql";
import {
  NewNotificationSub,
  NotificationParts,
  NotificationsQuery,
} from "./notifications.graphql";
import { NotificationItem } from "./NotificationItem";

export function NotificationBell() {
  const { data } = useQuery(NotificationsQuery);
  const [open, setOpen] = useState(false);

  useSubscription(NewNotificationSub, {
    onData: ({ data: result, client }) => {
      const notification = result.data?.newNotification;
      if (!notification) return;
      // дописываем новое уведомление в кэш списка (вверх); счётчик пересчитается сам
      client.cache.updateQuery({ query: NotificationsQuery }, (prev) =>
        prev ? { notifications: [notification, ...prev.notifications] } : prev,
      );
    },
  });

  const items = data?.notifications ?? [];
  // Непрочитанные считаем ИЗ КЭША (read:false), а не локальным useState: счётчик
  // переживает навигацию/перемонтирование и синхронен с данными. Отметка
  // «прочитано» (мутация markAsRead) появится на следующем этапе — тогда badge
  // будет спадать по реальному изменению read, а не по фейковому сбросу.
  const unread = items.filter(
    (n) => !getFragmentData(NotificationParts, n).read,
  ).length;

  return (
    <div className="relative">
      <Button variant="ghost" onPress={() => setOpen((o) => !o)}>
        🔔
        {unread > 0 && (
          <span className="ml-1 rounded-full bg-danger px-1.5 text-xs text-white">
            {unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 max-h-96 w-80 overflow-auto rounded-lg border border-default-200 bg-background shadow-lg">
          {items.length === 0 ? (
            <div className="p-4 text-default-500">Нет уведомлений</div>
          ) : (
            items.map((n) => (
              <NotificationItem
                key={getFragmentData(NotificationParts, n).id}
                notification={n}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
