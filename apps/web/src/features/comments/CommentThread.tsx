import { useEffect, useOptimistic, useRef } from "react";
import type { ApolloCache, Reference, StoreObject } from "@apollo/client";
import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { Input, Skeleton } from "@heroui/react";
import { useAuth } from "../auth/AuthProvider";
import { SubmitButton } from "../auth/SubmitButton";
import { AddCommentDoc } from "../post/post.mutations";
import { SetTypingDoc } from "../presence/presence.graphql";
import { TypingIndicator } from "../presence/TypingIndicator";
import {
  CommentAddedSub,
  PostCommentsQuery,
  ReactionAddedSub,
} from "./comments.graphql";

// минимум, который нужен рендеру строки: реальные комментарии запроса и
// оптимистичные «отправляемые» приводятся к одной форме
interface ThreadComment {
  id: string;
  content: string;
  author: { username: string; displayName?: string | null };
  pending?: boolean;
}

interface NewComment {
  id: string;
  content: string;
  author: { id: string; username: string };
}

// Дозапись комментария в кэш-список поста. Общая для мутации и подписки: свой
// комментарий прилетает ОБОИМИ путями (бэкенд не фильтрует отправителя в
// commentAdded), поэтому дедуп по id обязателен — иначе строка и счётчик двоятся.
function appendToCache(
  cache: ApolloCache,
  postId: string,
  comment: NewComment,
) {
  const id = cache.identify({ __typename: "Post", id: postId });
  let appended = false;
  cache.modify({
    id,
    fields: {
      comments: (existing: readonly Reference[] = [], { toReference, readField }) => {
        if (existing.some((ref) => readField("id", ref) === comment.id)) {
          return existing;
        }
        appended = true;
        // второй аргумент true — записать сущность в стор (подписка, в отличие
        // от мутации, сама в кэш ничего не пишет). Каст: у сгенерированного типа
        // нет индексной сигнатуры StoreObject, рантайм-объект ей соответствует.
        return [
          ...existing,
          toReference(comment as unknown as StoreObject, true) as Reference,
        ];
      },
    },
  });
  // счётчик — только если комментарий действительно дописан (не дубль)
  if (appended) {
    cache.modify({
      id,
      fields: { commentCount: (n) => (n as number) + 1 },
    });
  }
}

export function CommentThread({ postId }: { postId: string }) {
  const { user: me } = useAuth();
  // cache-and-network: при повторном разворачивании ветки кэш рисуется сразу,
  // но сеть догоняет комментарии, добавленные пока ветка была свёрнута
  // (подписка живёт только у развёрнутой ветки, пропущенное само не приедет)
  const { data, loading, error, refetch } = useQuery(PostCommentsQuery, {
    variables: { id: postId },
    fetchPolicy: "cache-and-network",
  });
  const [addComment] = useMutation(AddCommentDoc);
  const [setTyping] = useMutation(SetTypingDoc);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const typingActive = useRef(false);

  // сворачивание ветки посреди набора: гасим таймер и снимаем «печатает…»
  // у остальных (иначе стрельнул бы устаревший setTyping после размонтирования)
  useEffect(
    () => () => {
      clearTimeout(typingTimer.current);
      if (typingActive.current) {
        typingActive.current = false;
        void setTyping({ variables: { postId, isTyping: false } });
      }
    },
    [postId, setTyping],
  );

  const comments: ThreadComment[] = data?.post?.comments ?? [];

  // useOptimistic — локальный оптимизм на уровне компонента: «отправляемый»
  // комментарий виден сразу, а когда action завершится, оптимистичный слой сам
  // откатится к базовому списку — тот уже содержит настоящую строку из кэша.
  // Редьюсер ЧИСТЫЙ: id приходит аргументом (генерируется один раз в submit) —
  // React переигрывает оптимистичные апдейты на каждой новой базе, и Date.now()
  // внутри редьюсера менял бы key строки на каждом ререндере
  const [optimisticComments, addOptimistic] = useOptimistic(
    comments,
    (state, next: { id: string; content: string }): ThreadComment[] => [
      ...state,
      {
        id: next.id,
        content: next.content,
        author: { username: me?.username ?? "вы" },
        pending: true,
      },
    ],
  );

  // живые комментарии других под развёрнутым постом; до первого ответа запроса
  // не подписываемся — ответ и так включает всё на момент снапшота, а правки
  // кэша до появления поля comments ушли бы в пустоту (cache.modify не создаёт поля).
  // Комментарий, проскочивший МЕЖДУ снапшотом запроса и регистрацией подписки,
  // в эту сессию ветки не попадёт — подтянется рефетчем при следующем открытии
  // (cache-and-network выше); окно в один RTT считаем приемлемым
  useSubscription(CommentAddedSub, {
    variables: { postId },
    skip: !data?.post,
    onData: ({ data: sub, client }) => {
      const comment = sub.data?.commentAdded;
      if (comment) appendToCache(client.cache, postId, comment);
    },
  });

  // реакции двигают счётчик в нормализованной записи Post:<id> — та же техника
  // cache.modify, что и в оптимистичном LikeButton, но источник — подписка
  useSubscription(ReactionAddedSub, {
    variables: { postId },
    onData: ({ data: sub, client }) => {
      const ev = sub.data?.reactionAdded;
      if (!ev) return;
      const cacheId = client.cache.identify({ __typename: "Post", id: postId });
      if (ev.userId === me?.id) {
        // моя реакция из ДРУГОЙ вкладки/устройства: если myReaction здесь уже
        // совпадает — это эхо локального клика (учтён оптимистично), иначе
        // синхронизируем и заливку сердца, и счётчик
        let alreadyApplied = false;
        client.cache.modify({
          id: cacheId,
          fields: {
            myReaction: (prev) => {
              alreadyApplied = prev === ev.type;
              return ev.type;
            },
          },
        });
        if (alreadyApplied) return;
      }
      client.cache.modify({
        id: cacheId,
        fields: { reactionCount: (n) => (n as number) + 1 },
      });
    },
  });

  const submit = async (formData: FormData) => {
    const content = String(formData.get("content") ?? "").trim();
    if (!content) return;
    clearTimeout(typingTimer.current);
    if (typingActive.current) {
      typingActive.current = false;
      void setTyping({ variables: { postId, isTyping: false } });
    }
    // строка появляется сразу, полупрозрачной
    addOptimistic({ id: `temp-${crypto.randomUUID()}`, content });
    try {
      await addComment({
        variables: { postId, content },
        update: (cache, { data: result }) => {
          const created = result?.addComment;
          if (created) appendToCache(cache, postId, created);
        },
      });
    } catch {
      // Apollo/React сами откатят оптимистику; заметный пользователю тост
      // об ошибке — отдельной доработкой
    }
  };

  // сигнал «печатает…» (эфемерный, мимо кэша): isTyping:true шлём один раз на
  // «серию» набора, а не на каждую клавишу; false — по паузе в 1.5 сек
  const onInput = () => {
    if (!typingActive.current) {
      typingActive.current = true;
      void setTyping({ variables: { postId, isTyping: true } });
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingActive.current = false;
      void setTyping({ variables: { postId, isTyping: false } });
    }, 1500);
  };

  if (loading && !data) {
    return <Skeleton className="my-2 h-16 w-full rounded-lg" />;
  }

  // Запрос не удался → ветка не готова. Форму НЕ показываем: без поля comments
  // в кэше update мутации ушёл бы в пустоту (cache.modify не создаёт полей) —
  // успешно созданный комментарий молча исчез бы из UI после отката оптимистики.
  if (!data?.post) {
    return (
      <div className="flex items-center gap-2 text-sm text-danger">
        Не удалось загрузить комментарии{error ? `: ${error.message}` : ""}
        <button
          type="button"
          className="underline"
          onClick={() => void refetch()}
        >
          повторить
        </button>
      </div>
    );
  }

  // свой комментарий может приехать подпиской РАНЬШЕ ответа мутации (бэкенд
  // публикует событие до возврата из резолвера) — прячем оптимистичный «призрак»,
  // если реальная строка с тем же текстом от меня уже в базовом списке
  const rows = optimisticComments.filter(
    (c) =>
      !c.pending ||
      !comments.some(
        (r) => r.content === c.content && r.author.username === me?.username,
      ),
  );

  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <div key={c.id} className={`text-sm ${c.pending ? "opacity-50" : ""}`}>
          <b>@{c.author.username}</b>: {c.content}
        </div>
      ))}
      <TypingIndicator postId={postId} />
      {/* React 19: form action — после завершения действия форма сбрасывается сама */}
      <form action={submit} className="flex items-center gap-2">
        <Input name="content" placeholder="Комментарий…" onInput={onInput} />
        <SubmitButton className="shrink-0">Отправить</SubmitButton>
      </form>
    </div>
  );
}
