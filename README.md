# social-platform

Монорепо социальной сети: NestJS + GraphQL (Apollo, code-first) бэкенд и (в будущих
этапах) React-фронтенд, связанные общим GraphQL-контрактом.

Инструменты: **Yarn 4 (workspaces)** + **Turborepo**.

## Структура

```text
social-platform/
├── apps/
│   └── api/          # NestJS бэкенд (GraphQL Apollo, code-first)
├── packages/         # общие пакеты (появятся позже: graphql-контракт, tsconfig-пресеты)
├── package.json      # корневой workspace
├── turbo.json        # оркестрация задач
└── .yarnrc.yml       # nodeLinker: node-modules
```

Реализованы **Этапы 1–4** бэкенда (`apps/api`):

- **Этап 1 — каркас:** GraphQL (Apollo, code-first), валидация конфигурации, Pino-логи,
  health (GraphQL + REST), graceful shutdown, глобальный exception-фильтр, лимит глубины запросов.
- **Этап 2 — доменное ядро:** PostgreSQL через **Prisma 6**, модели `User/Post/Comment/Reaction/
  Follow/Notification/Hashtag`, миграции, курсорная лента, интерактивные транзакции,
  **DataLoader** против N+1, полиморфные уведомления (`InterfaceType`) и разнородная лента (`UnionType`).
- **Этап 3 — аутентификация и защита:** регистрация/логин (**argon2id**, защита от timing-attack),
  **JWT** + refresh-токены с **ротацией** и reuse-detection (хеш в БД), refresh в **httpOnly-cookie**,
  `@CurrentUser`/`@Auth` + `GqlAuthGuard`, **RBAC** (`RolesGuard`), `PostOwnerGuard`, персонализированная
  лента подписок, поле `myReaction`, rate-limiting (`GqlThrottlerGuard` + `@Throttle`), валидация
  `JWT_SECRET`, **e2e-тесты** auth-флоу (Jest + supertest).
- **Этап 4 — реальное время:** **GraphQL Subscriptions** на `graphql-ws` с аутентификацией через
  `connectionParams` в `onConnect` (один раз на соединение); единый `context` для HTTP и WS
  (`@CurrentUser` и DataLoader работают и в подписках); **Redis** (`ioredis`) + `RedisPubSub` для
  масштабирования подписок между инстансами; события `postAdded`/`reactionAdded`/`commentAdded`/
  `newNotification`, два паттерна фильтрации (по подписчику и по аргументу `postId`); **presence**
  (счётчик соединений в Redis) и эфемерный **typing**; throttler на **shared Redis-хранилище**;
  быстрый **denylist** отозванных refresh-токенов (fail-open); GraphQL-aware `LoggingInterceptor`.

## Быстрый старт

```bash
# 1. Установить зависимости (из корня монорепо). postinstall сгенерирует Prisma Client.
yarn install

# 2. Подготовить env для api
cp apps/api/.env.example apps/api/.env

# 3. Поднять Postgres + Redis (Docker) и применить миграции
yarn workspace @social/api db:up                 # docker compose up -d (postgres + redis)
yarn workspace @social/api prisma:migrate        # prisma migrate dev

# 4. Запустить api в режиме разработки
yarn dev                       # через Turborepo
# или точечно: yarn workspace @social/api dev
```

> Postgres (`social-postgres-1`, порт **5432**) и Redis (`social-redis-1`, порт **6379**)
> поднимаются в контейнерах (см. `apps/api/docker-compose.yml`); строки подключения
> `DATABASE_URL`/`REDIS_URL` — в `apps/api/.env`.

Откройте `http://localhost:3000/graphql` — Apollo Sandbox. Пример сценария (Этап 3 — за auth):

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

**Подписки (Этап 4).** В Apollo Sandbox откройте Connection settings → Subscriptions и задайте
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

## Полезные команды

| Команда                                     | Что делает                                 |
| ------------------------------------------- | ------------------------------------------ |
| `yarn dev`                                  | dev-режим всех приложений (watch)          |
| `yarn build` / `yarn typecheck`             | сборка / проверка типов по монорепо        |
| `yarn workspace @social/api db:up`          | поднять Postgres + Redis в Docker          |
| `yarn workspace @social/api db:down`        | остановить контейнеры                      |
| `yarn workspace @social/api prisma:migrate` | создать/применить миграцию (`migrate dev`) |
| `yarn workspace @social/api prisma:studio`  | визуальный браузер БД                      |
| `yarn workspace @social/api test:e2e`       | e2e-тесты (Jest + supertest, нужна БД)     |
| `yarn workspace @social/api <скрипт>`       | запуск скрипта конкретного приложения      |
