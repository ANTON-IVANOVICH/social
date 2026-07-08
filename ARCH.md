# Архитектура

Монорепо социальной сети: два приложения, связанные одним GraphQL-контрактом.

```text
social-platform/
├── apps/api   # NestJS 11 · Apollo Server 5 (code-first) · Prisma 6 · Redis
├── apps/web   # React 19 · Vite 8 (Rolldown) · Apollo Client 4 · HeroUI v3
└── turbo.json # оркестрация: codegen фронта зависит от schema.gql бэка
```

Инструменты: Yarn 4 workspaces + Turborepo. Контракт — файл `apps/api/src/schema.gql`:
бэкенд генерирует его из декораторов при старте (`autoSchemaFile`), фронтенд читает его
GraphQL Code Generator'ом (client-preset) и получает типизированный `graphql()`. Фронт и бэк
развязаны: codegen не требует запущенного сервера.

## Бэкенд (`apps/api`)

### Слои бэкенда

```text
main.ts / app.setup.ts    HTTP-обвязка: helmet (CORP cross-origin для /static), CORS с
                          credentials, cookie-parser, ValidationPipe, graphqlUploadExpress
                          (только /graphql), статика storage/ → /static/
app.module.ts             GraphQLModule (Apollo, code-first) + подписки graphql-ws,
                          Throttler на Redis, Pino-логгер, глобальные фильтр/интерсептор
modules/*                 доменные модули: auth, users, posts, comments, reactions,
                          notifications, feed, presence, media, health
prisma/                   PrismaService (PostgreSQL)
redis/, pubsub/           @Global-модули: ioredis-клиенты и RedisPubSub (PUB_SUB)
common/                   декораторы (@Auth, @CurrentUser), guards, dataloader,
                          exception-фильтр, logging-интерсептор, depth-limit
```

### Ключевые решения бэкенда

- **Code-first GraphQL.** Схема — производная от кода; `sortSchema` для стабильного диффа.
  Глубина запросов ограничена валидационным правилом (`GRAPHQL_MAX_DEPTH`).
- **Единый context HTTP/WS.** Фабрика context различает транспорт по `extra` (его кладёт
  graphql-ws): в обоих случаях внутрь попадают `req.user` и свежие per-request DataLoader'ы,
  поэтому `@CurrentUser` и батчинг работают и в подписках. Нюанс WS: context создаётся один
  раз на операцию subscribe и живёт всю подписку — перед доставкой каждого события кэш
  лоадеров сбрасывается (`freshLoadersPerEvent`), иначе поздние события отдавали бы данные
  первой загрузки.
- **Аутентификация.** argon2id; пара JWT: короткий access (Bearer) + refresh в
  httpOnly-cookie с ротацией и reuse-detection (в БД — хеш); отзыв через Redis-denylist
  (fail-open — Redis не является точкой отказа логина). Guard'ы: `GqlAuthGuard`, `RolesGuard`
  (RBAC), `PostOwnerGuard`. Rate-limiting — `@nestjs/throttler` на shared Redis-хранилище.
- **Реальное время.** Подписки на `graphql-ws`; токен проверяется один раз в `onConnect`
  (браузерный WebSocket не умеет заголовки на handshake → токен в `connectionParams`).
  События идут через `RedisPubSub` — инстансы делят шину. Два паттерна фильтрации:
  по личности подписчика (`postAdded` — followingIds загружены при connect) и по аргументу
  (`reactionAdded(postId)`/`commentAdded(postId)`/`typing(postId)`). `reactionAdded`
  публикуется только при создании реакции — смена типа события не даёт.
  Presence — счётчики соединений в Redis с TTL и heartbeat-sweeper'ом; onDisconnect
  декрементит атомарным Lua-скриптом.
- **Данные.** Prisma 6; DataLoader'ы создаются на каждый запрос (кэш живёт в его пределах):
  `userById`, `postById`, счётчики реакций/комментариев (groupBy), `myReaction` по составному
  ключу, `commentsByPostId` (ветка треда одним `findMany`). Лента — курсорная
  (`createdAt+id`), для подписок персонализирована по follow-связям.
- **Уведомления.** Полиморфные: `InterfaceType Notification` + конкретные типы
  (Follow/Reaction/Comment) — резолвятся по `kind`, доставляются подпиской
  `newNotification` с фильтром по получателю.
- **Медиа.** `uploadAvatar(file: Upload!)`: multipart разворачивает `graphql-upload-minimal`
  (CJS-совместимый; сам `graphql-upload` — ESM-only). Поток пишется на диск `pipeline`'ом
  (ключ `uploads/<userId>/<uuid>.<ext>` — имя клиента в путь не попадает); превышение
  лимита размера рушит поток явно (busboy-событие `limit` само по себе не ошибка — иначе
  запрос висел бы вечно); содержимое сверяется с mimetype по magic bytes; мутация под
  rate-limit. Затем sharp в фоне (`limitInputPixels` + таймаут — защита от pixel-бомб)
  считает `.webp`/`_thumb.webp` без EXIF; ответ обработку не ждёт. Замена аватара удаляет
  прежние файлы. Раздача — статикой `/static/` c абсолютной базой `PUBLIC_URL` (фронт на
  другом origin; в production переменная обязательна). Нюанс: параметр резолвера
  типизирован `FileUpload`, НЕ `Promise<...>` — иначе глобальный ValidationPipe с
  transform пересоздаёт промис и ломает загрузку.
- **Наблюдаемость и живучесть.** Pino (reqId из `x-request-id`), GraphQL-aware
  LoggingInterceptor, health для оркестраторов (REST + GraphQL), graceful shutdown,
  глобальный exception-фильтр c единым форматом ошибок (детали валидации — в `extensions`),
  обработчик `unhandledRejection` как защитная сетка.

## Фронтенд (`apps/web`)

### Слои фронтенда

```text
src/app/        каркас: router (React Router 7), Layout, RequireAuth, Splash
src/features/   вертикальные фичи: auth, feed, post, comments, notifications,
                presence, profile
src/shared/     инфраструктура: apollo (client, cache, ws-client), auth
                (token-store, refresh, auth-events), ui (ErrorBoundary, theme)
src/gql/        сгенерировано codegen'ом (в git не попадает)
```

### Ключевые решения фронтенда

- **Цепочка линков Apollo.**
  `split(subscription → GraphQLWsLink, иначе → [ErrorLink, SetContextLink, UploadHttpLink])`.
  Терминальный `UploadHttpLink` шлёт обычные операции JSON-POST'ом, а мутации с `File` в
  переменных — multipart-запросом (`apollo-require-preflight` удовлетворяет CSRF-защиту
  Apollo Server). `ErrorLink` на `UNAUTHENTICATED` делает refresh (один in-flight промис)
  и повторяет запрос; провал refresh → `notifySessionExpired()` → централизованный логаут.
- **Сессия.** Access-токен только в памяти (`tokenStore` с pub/sub), refresh — в
  httpOnly-cookie (`credentials:"include"`, сам refresh — сырым `fetch` против рекурсии
  линков). Bootstrap: `use(Promise)` + Suspense — приложение саспендит, пока сессия не
  определена. WS-клиент читает токен лениво в async `connectionParams` (refresh перед
  connect), пересоздаёт соединение при смене токена и закрывается при логауте.
- **Кэш.** Нормализованный `InMemoryCache`; курсорная лента — field policy
  (`keyArgs: false` + merge с дедупом по id). Все правки счётчиков/списков идут в
  нормализованные записи (`Post:<id>`) через `cache.modify`/`cache.updateQuery` — изменение
  видно во всех вьюхах. Свои события дедупятся с серверными (свой комментарий приходит и
  мутацией, и подпиской — `appendToCache` проверяет id).
- **Данные → UI.** Suspense-первый подход: `useBackgroundQuery`+`useReadQuery` (лента),
  `useSuspenseQuery` (профиль), error boundaries с ретраем через `refetch`. Фрагменты с
  masking (`PostCard_post` + `getFragmentData`) — компонент видит строго свои поля.
  Ветка комментариев ленива: запрос и подписки живут, только пока пост развёрнут.
- **Оптимизм двух видов.** Общий кэш — `optimisticResponse` + `cache.modify` (лайк: мутация
  возвращает Boolean, состояние правится вручную; update выполняется на оптимистичном слое и
  повторно на реальном — счётчик `n+delta` не двоится). Локальный для компонента —
  React 19 `useOptimistic` (отправляемый комментарий в треде; откат автоматический по
  завершении action).
- **React 19.** Actions (`useActionState`/`useFormStatus`/form action c автосбросом),
  `use(Promise)`/`use(Context)`, контекст-как-провайдер, `useDeferredValue` (поиск по ленте),
  нативные метаданные документа (`<title>`/`<meta>` из дерева), `preload` ресурсов,
  React Compiler (авто-мемоизация, ручных `useMemo`/`useCallback` нет).
- **Реальное время в UI.** Одна подписка presence на приложение (провайдер, набор онлайн-id
  сбрасывается при смене пользователя); живая лента `subscribeToMore` с защитой от гонки
  «событие раньше первого ответа»; уведомления пишутся в кэш `cache.updateQuery`, счётчик
  непрочитанных — производное от кэша, не локальный стейт.

## Сквозные потоки (примеры)

**Лайк:** клик → optimisticResponse (UI мгновенно) → мутация `react` → Redis pubsub →
`reactionAdded` у подписчиков развёрнутого поста → у них `cache.modify` двигает счётчик
(свои события пропускаются — уже учтены оптимистично).

**Аватар:** input → `UploadHttpLink` multipart → `graphqlUploadExpress` →
`MediaService.store` (pipeline на диск) → ответ с `User { avatarUrl }` (Apollo обновляет
запись `User:<id>` — аватар меняется везде) → sharp в фоне дописывает webp-производные →
`/static/` отдаёт файлы (CORP: cross-origin).

**Комментарий:** form action → `useOptimistic` строка сразу → мутация `addComment` →
update дописывает в `Post.comments` (дедуп) → оптимистичная строка откатывается на реальную;
у остальных зрителей поста то же делает подписка `commentAdded`; автор поста получает
`newNotification`.
