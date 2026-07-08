# Changelog

Заметные изменения проекта, новые сверху. Формат свободный: дата — что изменилось и зачем.

## 2026-07-08 — Оптимистичный UX, комментарии и медиа

**Бэкенд (`apps/api`):**

- `Post.comments` — read-path ветки комментариев: field-резолвер + DataLoader
  `commentsByPostId` (один `findMany` на все посты выборки, порядок треда от старых к новым).
- Модуль `media`: мутация `uploadAvatar(file: Upload!)` по спеке GraphQL multipart request
  (`graphql-upload-minimal`); поток на диск через `pipeline` с чисткой недокачанных файлов;
  ключ файла с расширением из mimetype (корректный Content-Type у статики); whitelist
  jpeg/png/webp. Обработка **sharp** в фоне (fire-and-forget): авто-ориентация, ресайз ≤512,
  `.webp` + `_thumb.webp`, EXIF/GPS не копируются — ответ мутации обработку не ждёт.
  С появлением очередей переедет в воркер без смены контракта.
- Раздача загруженного: `/static/` из `storage/` (`useStaticAssets`), helmet CORP ослаблен до
  `cross-origin` (SPA живёт на другом origin), новая настройка `PUBLIC_URL` — база абсолютных
  ссылок на файлы. `graphqlUploadExpress` повешен только на `/graphql` (лимит 15 МБ, 1 файл).
- `reactionAdded` публикуется только при **создании** реакции: смена типа существующей больше
  не даёт события (живые счётчики на клиенте не задваиваются) и не плодит повторных уведомлений.
- Нюанс, зафиксированный в коде: параметр `Upload` типизирован как `FileUpload` (не
  `Promise<FileUpload>`), иначе глобальный `ValidationPipe` (transform) пересоздавал промис
  через `new Promise(undefined)` и ломал загрузку.

**Фронтенд (`apps/web`):**

- Оптимистичный лайк: `LikeButton` на `optimisticResponse` + `cache.modify` (мутации
  `react`/`unreact` возвращают `Boolean` → кэш правится вручную); во фрагмент `PostCard_post`
  добавлен `myReaction`.
- Ветка комментариев: разворачивается по клику на 💬 — ленивый запрос `PostComments`,
  «отправляемый» комментарий через **React 19 `useOptimistic`** (полупрозрачный, откат
  автоматический), отправка через form action (форма сбрасывается сама), сигнал typing с
  дебаунсом переехал сюда из `CommentBox` (удалён).
- Живые события развёрнутого поста: `commentAdded` (чужие комментарии) и `reactionAdded`
  (чужие реакции двигают счётчик через `cache.modify`); общий помощник `appendToCache`
  с дедупом по id — свой комментарий приходит и мутацией, и подпиской.
- Клиентский поиск по ленте: `SearchableFeed` на `useDeferredValue` (ввод отзывчив, список
  «догоняет» с притуханием); в запрос ленты добавлено поле `content`.
- Медиа: терминальный линк `UploadHttpLink` (`apollo-upload-client` v19) вместо `HttpLink` —
  File в переменных уезжает multipart-запросом, заголовок `apollo-require-preflight` для
  CSRF-защиты Apollo Server; в codegen скаляр `Upload → File`; `AvatarUpload` — мутация
  возвращает `User`, Apollo сам обновляет нормализованную запись (аватар меняется везде).
- Страница профиля (`ProfilePage`): `useSuspenseQuery` + нативные метаданные документа React 19
  (`<title>`/`<meta>` из дерева) + `preload` аватара при наведении на автора в ленте;
  `ProfileCard` стал презентационным, показывается `bio`; загрузка аватара — только на своём
  профиле.

**Устойчивость и безопасность (по итогам адверсариального ревью — 24 гипотезы, 19 подтверждено
и исправлено):**

- Загрузка сверх `maxFileSize` больше не подвешивает запрос навсегда: graphql-upload шлёт
  busboy-событие `limit` без ошибки/end у потока — теперь поток рушится явно и клиент
  получает 413 за ~0.1 с; недокачанный файл удаляется.
- Содержимое файла сверяется с заявленным mimetype по **magic bytes** (JPEG/PNG/WebP) до
  записи URL в БД; `uploadAvatar` под rate-limit (10/час); sharp получил `limitInputPixels`
  (25 МП) и таймаут — защита от pixel-бомб; при повторной загрузке старый файл и его
  webp-производные удаляются (и при неудачном апдейте БД новый файл не сиротеет);
  `PUBLIC_URL` обязателен в production (иначе в БД пеклись бы localhost-ссылки).
- WS-подписки: DataLoader'ы контекста живут всю подписку — их кэш теперь сбрасывается
  перед каждым событием (`freshLoadersPerEvent`), иначе поздние события отдавали бы
  устаревших авторов и счётчики. Реакция создаётся через `create` → на `P2002` `update`:
  уникальный индекс сам решает гонку, событие/уведомление не задваиваются. Порядок
  комментариев стабилен при равных `createdAt` (тай-брейкер по id).
- Фронт: ветка комментариев на `cache-and-network` (повторное открытие дотягивает
  пропущенное), при упавшем запросе — ошибка с ретраем вместо формы над пустотой
  (успешный `addComment` без поля `comments` в кэше молча терялся: `cache.modify` не
  создаёт полей); поиск по ленте скрывает карточки, а не размонтирует (развёрнутые ветки
  и черновики переживают фильтр); свои реакции из другой вкладки синхронизируются
  (не отбрасываются как эхо); редьюсер `useOptimistic` чист (id генерируется в submit);
  «призрак» своего комментария прячется, когда WS-копия обгоняет ответ мутации;
  индикатор «печатает…» с TTL (обрыв у печатающего не вешает его навсегда) и очисткой
  таймеров/сигнала при размонтировании; `isTyping:true` шлётся раз на серию набора,
  а не на каждую клавишу.

Проверено вживую: multipart-загрузка end-to-end (webp-производные появляются, статика отдаёт
корректный Content-Type и CORP), oversize → мгновенный 413, подделка сигнатуры → 400,
замена аватара подчищает старые файлы, троттлер отдаёт 429, `reactionAdded` не срабатывает
на смену типа (WS-клиент), `Post.comments` с DataLoader, e2e-сьюты бэка 10/10,
typecheck/lint/build обоих приложений.

## 2026-06-27 — Реальное время на фронтенде

- `GraphQLWsLink` + `split`: подписки → WS, query/mutation → HTTP-цепочка.
- WS-аутентификация через async `connectionParams` (ленивое чтение токена, refresh перед
  connect, реконнект при смене токена, terminate при logout).
- Живая лента `subscribeToMore(postAdded)` с дедупом; колокол уведомлений
  (`useSubscription` + `cache.updateQuery`, полиморфный рендер по `__typename`, счётчик
  непрочитанных считается из кэша); presence-провайдер (онлайн-точки) и эфемерный typing.

## 2026-06-27 — Доменная лента и аутентификация на фронтенде

- Кэш-политика курсорной ленты (`keyArgs: false` + merge с дедупом), `useBackgroundQuery` /
  `useReadQuery` + Suspense/error-boundary, `fetchMore` в `startTransition`.
- Кука-флоу аутентификации: access в памяти, refresh в httpOnly-cookie, `SetContextLink` +
  `ErrorLink` с одним in-flight refresh; bootstrap сессии через `use(Promise)`; формы на
  React 19 Actions (`useActionState`/`useFormStatus`); маршруты под `RequireAuth`.

## 2026-06-27 — Каркас фронтенда

- Vite 8 + React 19 + React Compiler; HeroUI v3 + Tailwind v4; Apollo Client 4 с
  нормализованным кэшем; GraphQL Code Generator (client-preset) по `schema.gql` бэкенда;
  React Router 7.

## 2026-06-27 — Реальное время на бэкенде

- GraphQL Subscriptions (`graphql-ws`) с аутентификацией в `onConnect`; единый context
  HTTP/WS; Redis + `RedisPubSub`; события `postAdded`/`reactionAdded`/`commentAdded`/
  `newNotification`; presence (счётчики соединений, TTL + heartbeat-sweeper) и typing;
  throttler на shared Redis; e2e-тесты подписок на реальном ws-клиенте.

## 2026-06-26 — Доменное ядро и аутентификация

- NestJS 11 + Apollo (code-first), Prisma 6 + PostgreSQL, DataLoader против N+1, курсорная
  лента, полиморфные уведомления; argon2id, JWT + ротация refresh с reuse-detection,
  httpOnly-cookie, RBAC, rate-limiting, e2e auth-флоу.
