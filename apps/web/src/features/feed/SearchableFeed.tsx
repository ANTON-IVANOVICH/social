import { useDeferredValue, useState } from "react";
import { Input } from "@heroui/react";
import { PostCard } from "../post/PostCard";
import type { FeedResult } from "./feed.graphql";

// Клиентский поиск по уже загруженной ленте. useDeferredValue держит ввод
// (высокий приоритет) отзывчивым: тяжёлый ререндер списка карточек считается по
// ОТСТАЮЩЕМУ значению (низкий приоритет), а на время «догона» список притухает.
// Для серверного поиска отложенное значение стало бы переменной запроса — у
// бэкенда такого поля пока нет, поэтому фильтруем на клиенте.
export function SearchableFeed({
  items,
}: {
  items: FeedResult["feed"]["items"];
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);

  const needle = deferred.trim().toLowerCase();
  const matches = (content: string) =>
    !needle || content.toLowerCase().includes(needle);
  const anyMatch = items.some((p) => matches(p.content));
  const stale = query !== deferred; // список ещё «догоняет» ввод

  return (
    <>
      <Input
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder="Поиск по ленте…"
        aria-label="Поиск по ленте"
        className="mb-3"
      />
      <div className={stale ? "opacity-60 transition-opacity" : undefined}>
        {/* несовпавшие карточки СКРЫВАЕМ, а не размонтируем: у карточки есть
            состояние (развёрнутая ветка, черновик комментария) — поиск не
            должен его уничтожать */}
        {items.map((post) => (
          <div key={post.id} hidden={!matches(post.content)}>
            <PostCard post={post} />
          </div>
        ))}
        {!anyMatch && (
          <div className="py-6 text-center text-default-500">
            Ничего не найдено
          </div>
        )}
      </div>
    </>
  );
}
