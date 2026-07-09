# Архитектура

Монорепо социальной сети: два приложения, связанные одним GraphQL-контрактом.

```text
social-platform/
├── apps/api        # NestJS 11 · Apollo Server 5 (code-first) · Prisma 6 · Redis
├── apps/web        # React 19 · Vite 8 (Rolldown) · Apollo Client 4 · HeroUI v3
├── apps/federation # Apollo Federation: 3 subgraph'а + gateway (демонстрация)
└── turbo.json      # оркестрация: codegen фронта зависит от schema.gql бэка
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
                          notifications, feed, presence, media, health, maintenance, outbox
modules/posts/cqrs/       команды/агрегат/доменные события/обработчики/сага агрегата Post
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
  (Follow/Reaction/Comment/Mention) — резолвятся по `kind`, доставляются подпиской
  `newNotification` с фильтром по получателю. Рождаются в одном месте —
  `NotificationsService.notify/notifyMany` (запись + publish + постановка доставки), которую
  зовут и слушатель доменных событий, и сага упоминаний.
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
- **Фон, события, масштабирование.** Сервисы не выполняют побочные эффекты сами, а **эмитят
  доменные события** (`@nestjs/event-emitter`, классы-DTO в `src/events/`); слушатели
  (`@OnEvent`) делают real-time publish, пишут уведомления и ставят задачи в **очереди BullMQ**
  (`feed-fanout`/`notifications`/`maintenance`, retry/backoff, `removeOnComplete`). `emit`
  (не `emitAsync`) — пользователь не ждёт; ошибка слушателя изолирована. **Fan-out on write:**
  публикация поста разносится по лентам подписчиков (и автора) в Redis sorted set
  `feed:<userId>` (score = время, обрезка 800, TTL 14д). Чтение `feed` **гибридное**: первая
  страница — O(1) из набора + гидрация; страницы 2+ и промах — keyset-пагинация по БД
  `(createdAt,id)` (без тупиков на хвосте/пустом наборе и без пропуска постов с одинаковой мс).
  `unfollow` сбрасывает набор (событие `user.unfollowed`) — пересбор из БД без бывших подписок.
  **Уведомления** доставляются очередью с
  идемпотентностью (`SET NX delivered:<id>`). **Планировщик** (`@nestjs/schedule`): cron ставит
  задачу с фиксированным `jobId` (дедуп BullMQ = распределённый замок), воркер выполняет один
  раз. **Тренды** — топ хэштегов сырым SQL (`$queryRaw`), кэш в Redis с пересчётом по расписанию.
- **CQRS для агрегата `Post`.** Две шины сосуществуют осознанно: лёгкий `event-emitter` для
  простых агрегатов (follow/react/comment) и полный CQRS (`@nestjs/cqrs`) для самого
  нагруженного на запись. Запись — `CommandBus` (обработчик владеет транзакцией), чтение —
  `QueryBus` (`GetFeedQuery`), инварианты и доменные события — `PostAggregate` (`AggregateRoot`,
  `apply` → `commit`), быстрые in-process реакции — `@EventsHandler` (real-time `postAdded`),
  оркестрация — **сага** (`@Saga`, `ofType`): `PostCreatedDomainEvent` → `ProcessMentionsCommand`
  → `MENTION`-уведомления упомянутым (`@username` матчится регистронезависимо, потолок 20 на пост,
  сам себя не уведомляешь). `PostsService` стал read-only.
- **Transactional outbox.** Разрыв «коммит ↔ эмит» закрыт: `CreatePostHandler` пишет пост,
  хэштеги и строку `outbox_events` **в одной транзакции** — либо есть и то и другое, либо ничего.
  `OutboxRelayer` (`@Interval(1000)`) забирает пачку `SELECT … FOR UPDATE SKIP LOCKED`
  (`SKIP LOCKED` = соседние инстансы берут разные строки, таблица работает распределённой
  очередью), ставит fan-out в BullMQ и помечает строки `processed` — всё внутри одной
  транзакции: упал процесс посередине → откат → строки снова `pending`, повтор безопасен
  (фиксированный `jobId` дедуплицирует задачу). Ошибка ловится **построчно** и растит `attempts`
  (после 5 → `failed`): иначе одна ядовитая строка, будучи самой старой, навсегда встала бы в
  голове очереди. Разобранные строки — журнал, а не данные: почасовой `prune` убирает старше
  7 дней. Real-time (`postAdded`) намеренно остался best-effort — гарантию нужно давать
  материализации ленты, а не анимации.
- **Быстрый путь + гарантия.** Упоминания — durable-данные, но их порождает сага, живущая в
  памяти. Поэтому relayer ставит из той же outbox-строки ещё и задачу `mentions`. Обе дороги
  ведут к одной команде, а повтор гасит уникальный `dedupeKey` (`createManyAndReturn` +
  `skipDuplicates` возвращает только реально вставленные строки, поэтому дубль ничего не
  публикует). `NULL` не конфликтует с `NULL` в PostgreSQL — уведомления без ключа
  (комментарий за комментарием) по-прежнему приходят каждый раз.
- **Наблюдаемость и живучесть.** Pino (reqId из `x-request-id`), GraphQL-aware
  LoggingInterceptor, health для оркестраторов (REST + GraphQL), graceful shutdown,
  глобальный exception-фильтр c единым форматом ошибок (детали валидации — в `extensions`),
  обработчик `unhandledRejection` как защитная сетка.

## Федерация (`apps/federation`)

Отдельное демонстрационное развёртывание **рядом** с монолитом, а не вместо него: монолит
остаётся рабочим API фронтенда, федерация показывает, как тот же граф разрезается на
независимо разворачиваемые части.

```text
src/apps/users/       владелец User: @key(id), @ResolveReference, Query.user/me   :4001
src/apps/posts/       владелец Post/Comment; расширяет чужой User полем posts      :4002
src/apps/engagement/  владелец Reaction; расширяет чужой Post полями reactionCount :4003
src/apps/gateway/     ApolloGatewayDriver + IntrospectAndCompose → supergraph      :4000
src/libs/common/      Prisma, JWT-guard, @CurrentUser, фабрика subgraph-модуля
```

- **Механика сшивки.** Сущность помечается `@key(fields: "id")`. Владелец умеет отдать её по
  ключу (`@ResolveReference`). Чужой subgraph объявляет тот же тип с `@extends` и `@external id`
  и **дописывает свои поля** — `@apollo/subgraph` сам отдаёт представление как есть, поэтому
  reference-резолвер там не нужен. Обратно: `Post.author` возвращает не объект, а **ссылку**
  `{ __typename: "User", id }` — остальное gateway достроит у владельца. Итог: `post { author
  { username } reactionCount }` собирается из трёх процессов.
- **DataLoader обязателен.** Gateway присылает представления **пачкой** в один `_entities`,
  и reference-резолвер зовётся по разу на представление — без батчинга это N+1 на ровном месте.
  Лоадеры создаются на запрос в фабрике контекста.
- **Reference-резолвер без параметр-декораторов.** `__resolveReference` получает
  `(reference, context, info)`; у него нет слота `args`, поэтому `@Context()` вернул бы `info`.
  Nest биндит метод напрямую, когда декораторов нет, — на этом и держится доступ к лоадерам.
- **Аутентификация.** Gateway лишь **пробрасывает** `Authorization` (`RemoteGraphQLDataSource.
  willSendRequest`), а токен проверяет каждый subgraph сам: gateway не должен быть точкой
  доверия, иначе прямой запрос в subgraph минует авторизацию.
- **Разрезанный граф опаснее целого.** Supergraph замкнут циклом `Post.author → User.posts → …`,
  и звенья живут в разных subgraph'ах: на каждом уровне gateway делает новый `_entities`-запрос,
  а ответ растёт экспоненциально. Поэтому `depthLimit` стоит и на gateway, и на каждом subgraph'е.
  `User.posts` отдаёт только `PUBLIC` (зрителя на этом пути нет, а в монолите такого поля не
  существует — иначе это была бы новая утечка) и ограничен потолком **на каждого автора** через
  `row_number()`: общий `take` обрезал бы выборку целиком, и посты «тихого» автора пропали бы
  из-за плодовитого соседа. Subgraph'ы слушают loopback — наружу смотрит только gateway.
- **Честные ограничения.** Все subgraph'ы читают одну БД — здесь режется **граф**, а не
  хранилище. `IntrospectAndCompose` привязывает старт gateway к доступности всех subgraph'ов
  (в проде — заранее собранный supergraph или managed federation). Главное: **подписки в
  федерации не работают** через классический `@apollo/gateway` — их умеет Apollo Router либо их
  выносят мимо gateway. Для приложения, настолько завязанного на подписки, это делает федерацию
  решением «по необходимости», а не «по умолчанию» — потому монолит и остался основным API.

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
- **Производительность и устойчивость.** Code-splitting по маршрутам (`route.lazy` → отдельные
  чанки; Vite выделяет каждый динамический `import()`), стартовый бандл — лента + каркас.
  Отдельная страница поста `/p/:id`: быстрые поля через `useSuspenseQuery`, комментарии —
  вторым запросом (замена серверного `@defer`, недоступного на `graphql@16`; апгрейд к
  alpha-графу исключён). Персист нормализованного кэша (`apollo3-cache-persist` → `localStorage`)
  восстанавливается ДО первого рендера в async-bootstrap → мгновенный старт и офлайн-чтение;
  на logout — `pause()`+`purge()` (пауза триггера, иначе отложенный persist от `clearStore`
  пересоздал бы ключ), на login — `resume()`; переполнение квоты глотается своим storage-враппером
  (последний снапшот сохраняется). Очистка кэша (in-memory + снапшот) — общий `clearLocalSession()`
  и на logout, и на истечении сессии (иначе данные утекли бы следующему пользователю). Ошибки:
  `onUncaughtError`/`onCaughtError` в `createRoot` + `report()`, гранулярные компонентные
  `ErrorBoundary` **и** route-level `errorElement` (падение `route.lazy()`/404 — внутри каркаса).
  `errorPolicy` дефолтный: suspense-чтения на ошибке бросают → ловит `ErrorBoundary` с ретраем.

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

**Публикация поста (CQRS + outbox + fan-out):** `createPost` → `CommandBus` →
`CreatePostHandler`: одна транзакция пишет пост, хэштеги и строку `outbox_events`. После
коммита агрегат публикует `PostCreatedDomainEvent`, и дальше расходятся три дороги:
(1) `@EventsHandler` → `publish postAdded` — онлайн-подписчики видят пост мгновенно (WS,
best-effort); (2) **сага** → `ProcessMentionsCommand` → `MENTION`-уведомления упомянутым;
(3) `OutboxRelayer` (раз в секунду, `FOR UPDATE SKIP LOCKED`) → задача `feed-fanout` →
`FeedFanoutProcessor` разносит id поста по `feed:<подписчик>` в Redis (и в ленту автора) —
**гарантированно**, потому что событие лежит в той же транзакции, что и пост. Следующее чтение
`feed` (через `QueryBus`) берёт готовый список из набора; новый подписчик без набора получает
бэкофилл из БД, который заодно наполняет Redis.

**Кросс-subgraph-запрос (федерация):** `user(username) { username posts { content } }` →
gateway спрашивает `users` (получает `User` с `username` и ключом `id`) → шлёт представление
`{ __typename: "User", id }` в `posts` → там field-резолвер `posts` достраивает список
(батч через DataLoader). Обратно: `post { author { username } }` — `posts` вернёт ссылку,
gateway резолвит её через `@ResolveReference` в `users`. `Authorization` едет с каждым
подзапросом; проверяет его subgraph, а не gateway.
