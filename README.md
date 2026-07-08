# social-platform

Монорепо социальной сети: NestJS + GraphQL (Apollo, code-first) бэкенд и React 19 +
Apollo Client фронтенд, связанные общим GraphQL-контрактом (`schema.gql` → codegen).

Инструменты: **Yarn 4 (workspaces)** + **Turborepo**.

## Структура

```text
social-platform/
├── apps/
│   ├── api/          # NestJS бэкенд (GraphQL Apollo, code-first)
│   └── web/          # React 19 + Vite 8 SPA (Apollo Client 4, HeroUI v3)
├── packages/         # общие пакеты (появятся позже: graphql-контракт, tsconfig-пресеты)
├── package.json      # корневой workspace
├── turbo.json        # оркестрация задач (codegen фронта зависит от schema.gql бэка)
└── .yarnrc.yml       # nodeLinker: node-modules
```

## Что реализовано

### Бэкенд (`apps/api`)

- **GraphQL-каркас:** Apollo (code-first), валидация конфигурации, Pino-логи,
  health (GraphQL + REST), graceful shutdown, глобальный exception-фильтр, лимит глубины запросов.
- **Доменное ядро:** PostgreSQL через **Prisma 6**, модели `User/Post/Comment/Reaction/Follow/
  Notification/Hashtag`, миграции, курсорная лента, интерактивные транзакции, **DataLoader**
  против N+1, полиморфные уведомления (`InterfaceType`) и разнородная лента (`UnionType`).
- **Аутентификация и безопасность:** регистрация/логин (**argon2id**, защита от timing-attack),
  **JWT** + refresh-токены с **ротацией** и reuse-detection (хеш в БД), refresh в **httpOnly-cookie**,
  `@CurrentUser`/`@Auth` + `GqlAuthGuard`, **RBAC** (`RolesGuard`), `PostOwnerGuard`, персонализированная
  лента подписок, поле `myReaction`, rate-limiting (`GqlThrottlerGuard` + `@Throttle`), валидация
  `JWT_SECRET`, быстрый **denylist** отозванных refresh-токенов (fail-open), **e2e-тесты** auth-флоу.
- **Реальное время:** **GraphQL Subscriptions** на `graphql-ws` с аутентификацией через
  `connectionParams` в `onConnect` (один раз на соединение); единый `context` для HTTP и WS
  (`@CurrentUser` и DataLoader работают и в подписках); **Redis** (`ioredis`) + `RedisPubSub` для
  масштабирования подписок между инстансами; события `postAdded`/`reactionAdded`/`commentAdded`/
  `newNotification`, два паттерна фильтрации (по подписчику и по аргументу `postId`); **presence**
  (счётчик соединений в Redis, TTL + heartbeat-sweeper) и эфемерный **typing**; throttler на
  **shared Redis-хранилище**; GraphQL-aware `LoggingInterceptor`; **e2e-тесты подписок** на
  реальном `graphql-ws`-клиенте (`test/subscriptions.e2e-spec.ts`).
- **Комментарии и медиа:** read-path ветки `Post.comments` (свой DataLoader — один `findMany`
  на все посты выборки); загрузка аватара `uploadAvatar(file: Upload!)` по спеке **GraphQL
  multipart request** (`graphql-upload-minimal`), поток на диск через `pipeline` с чисткой
  недокачанных файлов, ключ с расширением из mimetype; **sharp** в фоне (авто-ориентация, ресайз,
  `.webp` + `_thumb.webp`, EXIF/GPS не копируются) — ответ мутации обработку не ждёт; раздача
  `/static/` из `storage/` (helmet CORP → `cross-origin`, база абсолютных URL — `PUBLIC_URL`);
  `reactionAdded` публикуется только на **новую** реакцию — смена типа не двигает живые счётчики.

### Фронтенд (`apps/web`)

Каркас, подключённый к бэкенду **без изменения его кода** (только origin в CORS, в dev открыт):

- **Vite 8 + React 19 + React Compiler 1.0** (через `@vitejs/plugin-react` v6 +
  `@rolldown/plugin-babel` + `reactCompilerPreset` — авто-мемоизация, бейдж «Memo ✨»),
  линт Rules of React (`eslint-plugin-react-hooks`).
- **HeroUI v3 + Tailwind v4** без Provider (тема через CSS-переменные, компаунд-компоненты
  `Card.Header`/`Avatar.Image`, React Aria `onPress`/`isDisabled`), тёмная тема классом на корне.
- **Apollo Client 4**: раздельные импорты ядра (`@apollo/client`) и React-биндингов
  (`@apollo/client/react`), нормализованный `InMemoryCache` (сущности по `__typename`+`id`) с
  **field policy** для курсорной ленты (`feed`: `keyArgs:false` + `merge` по `nextCursor`).
- **GraphQL Code Generator** (client-preset) по `apps/api/src/schema.gql` — типизированный
  `graphql()`; роутинг React Router 7; типизированный `useQuery` (публичный профиль `user(username)`).
- **Фрагменты с masking:** колокейтед-фрагмент `PostCard_post` + `getFragmentData` — компонент
  видит строго свои поля; codegen связывает фрагмент с запросом `Feed`.
- **Suspense-лента:** `useBackgroundQuery` (запуск рано, без водопадов) + `useReadQuery` (саспендит
  только ленту) в паре с `<Suspense>` + error-boundary вместо ручных `loading`/`error`; `fetchMore`
  со `startTransition` — плавная бесконечная лента; дата-слой инкапсулирован в хук `useFeed`.
- **Аутентификация:** цепочка Apollo Links 4 — `SetContextLink` (Bearer access) + `ErrorLink`
  (на `UNAUTHENTICATED` → **refresh-ротация** одним in-flight промисом → повтор запроса);
  access-токен в памяти, **refresh в httpOnly-cookie** (`credentials:"include"`, сырой `fetch`
  для refresh против рекурсии); bootstrap сессии через **`use(Promise)`** + `<Suspense>`; контекст
  пользователя (`createContext` как провайдер + `use(Context)`).
- **Формы на React 19 Actions:** `useActionState` (состояние/ошибка/pending) + `useFormStatus`
  (pending кнопки без пропов), HeroUI `TextField`; защита маршрутов через `RequireAuth`.
- **Реальное время:** `GraphQLWsLink` (graphql-ws) + `split`-линк (подписки → WS, query/mutation →
  HTTP); WS-аутентификация через **async `connectionParams`** (читает токен лениво, обновляет перед
  connect — стыкуется с `onConnect` бэкенда); живая лента через `subscribeToMore` (с дедупом) в
  `useFeed`; колокол уведомлений (`useSubscription` + `cache.updateQuery`) с **полиморфным рендером
  по `__typename`**; presence (онлайн-точки) и эфемерный typing с дебаунсом; `wsClient.terminate()`
  при logout.
- **Оптимистичный UX:** лайк через **`optimisticResponse` + `cache.modify`** (мутация возвращает
  `Boolean` → кэш правится вручную; правка в нормализованной записи `Post:<id>` видна во всех
  вьюхах, счётчик не двоится); ветка комментариев разворачивается по клику — ленивый запрос
  `Post.comments` + **React 19 `useOptimistic`** («отправляемый» комментарий сразу виден
  полупрозрачным, откат автоматический); живые `commentAdded`/`reactionAdded` для развёрнутого
  поста (общий `appendToCache` с дедупом — свой комментарий приходит и мутацией, и подпиской);
  клиентский поиск по ленте на **`useDeferredValue`** (ввод отзывчив, список «догоняет»).
- **Медиа и метаданные:** `UploadHttpLink` (`apollo-upload-client`) вместо `HttpLink` — File в
  переменных уезжает multipart-запросом (`apollo-require-preflight` — для CSRF-защиты сервера),
  скаляр `Upload → File` в codegen; `AvatarUpload` — мутация возвращает `User`, Apollo сам
  обновляет нормализованную запись (аватар меняется во всех вьюхах без ручных правок кэша);
  страница профиля на `useSuspenseQuery` + **нативные метаданные документа** React 19
  (`<title>`/`<meta>` из дерева) и **`preload`** аватара при наведении на автора поста.
- **Производительность и архитектура:** **code-splitting** по маршрутам (`route.lazy` React
  Router 7 — профиль/пост/логин/регистрация грузятся отдельными чанками, стартовый бандл —
  лента + каркас); отдельная страница поста `/p/:id` — быстрые поля через `useSuspenseQuery`,
  ветка комментариев отдельным запросом (эффект «контент сразу, комментарии потоком» без
  серверного `@defer`, которого нет на `graphql@16`); **персист кэша** (`apollo3-cache-persist`
  → `localStorage`, мгновенный старт и офлайн-чтение) с восстановлением до первого рендера и
  очисткой на logout (пауза триггера, чтобы отложенный persist не воскресил ключ); **архитектура
  ошибок** — `onCaughtError`/`onUncaughtError` в `createRoot` + единый `report()`, гранулярные
  `ErrorBoundary` + **route-level `errorElement`** (падение ленивого чанка/404 рендерится внутри
  каркаса, а не голым экраном RR) + catch-all 404; проверка **React Compiler** через `react-scan`
  (dev). Подписки при федерализации — мимо gateway (`VITE_WS_URL` ≠ `VITE_API_URL`), поэтому
  `split`-линк остаётся. (`errorPolicy` оставлен дефолтным: suspense-чтения «всё или ошибка»
  должны бросать, чтобы `ErrorBoundary` с ретраем сработал.)

## Быстрый старт

```bash
# 1. Установить зависимости (из корня монорепо). postinstall сгенерирует Prisma Client.
yarn install

# 2. Подготовить env для api
cp apps/api/.env.example apps/api/.env

# 3. Поднять Postgres + Redis (Docker) и применить миграции
yarn workspace @social/api db:up                 # docker compose up -d (postgres + redis)
yarn workspace @social/api prisma:migrate        # prisma migrate dev

# 4. Подготовить env для web + сгенерировать типы из схемы бэкенда
cp apps/web/.env.example apps/web/.env
yarn workspace @social/web codegen   # читает apps/api/src/schema.gql → apps/web/src/gql

# 5. Запустить всё в режиме разработки
yarn dev                       # через Turborepo: api (:3000) + web (:5173)
# или точечно: yarn workspace @social/api dev  /  yarn workspace @social/web dev
```

> Postgres (`social-postgres-1`, порт **5432**) и Redis (`social-redis-1`, порт **6379**)
> поднимаются в контейнерах (см. `apps/api/docker-compose.yml`); строки подключения
> `DATABASE_URL`/`REDIS_URL` — в `apps/api/.env`.
>
> **Фронт ↔ бэк:** `codegen` читает `apps/api/src/schema.gql` (пишется бэкендом при
> старте), поэтому хотя бы раз запустите api перед первым `codegen`. Фронт на
> `http://localhost:5173`. Откройте `/register`, создайте пользователя — залогинит и
> кинет на ленту; refresh живёт в httpOnly-cookie, перезагрузка тихо восстановит сессию.
> CORS в dev рефлексирует origin + credentials — правок бэкенда не нужно.

Откройте `http://localhost:3000/graphql` — Apollo Sandbox. Пример сценария (за auth):

```graphql
# 1. регистрация + логин (получаем accessToken/refreshToken)
mutation { register(input:{username:"alice", password:"supersecret1"}){ id username role } }
mutation { login(input:{username:"alice", password:"supersecret1"}){ tokens{ accessToken refreshToken } } }

# 2. в панели Headers: Authorization: Bearer <accessToken>, затем:
mutation { createPost(input:{content:"Мой пост #nestjs"}){ id author{ username } } }   # author из токена
query { feed(limit: 10) {                                                              # лента подписок + свои
  items { content author { username } reactionCount commentCount myReaction }
  nextCursor
} }
```

REST-проба для оркестраторов: `curl http://localhost:3000/health`.

**Подписки.** В Apollo Sandbox откройте Connection settings → Subscriptions и задайте
`connectionParams`: `{ "authorization": "Bearer <accessToken>" }` (для WS токен едет здесь, а не в Headers).

```graphql
# Вкладка 1 (токен bob): живые уведомления bob'а
subscription { newNotification {
  __typename id createdAt
  ... on FollowNotification { follower { username } }
  ... on ReactionNotification { actor { username } post { id } }
} }

# Вкладка 2 (Headers: Authorization: Bearer <токен alice>): alice подписывается на bob
mutation { follow(userId: "BOB_ID") }     # во вкладке 1 мгновенно прилетит FollowNotification
```

Аналогично: `postAdded` (живая лента подписок), `reactionAdded(postId)`/`commentAdded(postId)`
(события на странице поста), `typing(postId)` и `presenceChanged` (онлайн-статус).

**Загрузка аватара** (multipart, без Sandbox — curl):

```bash
curl http://localhost:3000/graphql \
  -H "authorization: Bearer <accessToken>" -H "apollo-require-preflight: true" \
  -F operations='{"query":"mutation($file: Upload!){ uploadAvatar(file:$file){ avatarUrl } }","variables":{"file":null}}' \
  -F map='{"0":["variables.file"]}' \
  -F 0=@avatar.png
# рядом с файлом в apps/api/storage/ через секунду появятся .webp и _thumb.webp (фоновый sharp)
```

## Полезные команды

| Команда                                     | Что делает                                 |
| ------------------------------------------- | ------------------------------------------ |
| `yarn dev`                                  | dev-режим всех приложений (watch)          |
| `yarn build` / `yarn typecheck`             | сборка / проверка типов по монорепо        |
| `yarn workspace @social/api db:up`          | поднять Postgres + Redis в Docker          |
| `yarn workspace @social/api db:down`        | остановить контейнеры                      |
| `yarn workspace @social/api prisma:migrate` | создать/применить миграцию (`migrate dev`) |
| `yarn workspace @social/api prisma:studio`  | визуальный браузер БД                      |
| `yarn workspace @social/api test:e2e`       | e2e: auth+подписки (Postgres+Redis)        |
| `yarn workspace @social/web dev`            | фронт (Vite) на `localhost:5173`           |
| `yarn workspace @social/web codegen`        | типы из `apps/api/src/schema.gql`          |
| `yarn workspace @social/web build`          | codegen + tsc + vite build                 |
| `yarn workspace @social/<app> <скрипт>`     | запуск скрипта конкретного приложения      |
