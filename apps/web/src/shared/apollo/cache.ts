import { InMemoryCache, type Reference } from "@apollo/client";
import { CachePersistor } from "apollo3-cache-persist";

// Страница ленты с бэкенда: PostConnection { items: [Post!]!, nextCursor: String }
interface FeedPage {
  items: readonly unknown[];
  nextCursor: string | null;
  __typename?: string;
}

interface FeedMergeOptions {
  args: { cursor?: string | null } | null;
  readField: (fieldName: string, from: Reference) => unknown;
}

// InMemoryCache нормализует сущности по __typename + id (User/Post переиспользуются
// между запросами). PostConnection — транзиентная обёртка без id, поэтому курсорную
// ленту склеиваем вручную через field policy.
// Ключ хранилища вынесен в константу: тем же ключом чистим персист на logout.
const PERSIST_KEY = "social:apollo-cache";

export const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        feed: {
          // все вызовы feed() — одно логическое поле; курсор не плодит записи кэша
          keyArgs: false,
          merge(
            existing: FeedPage | undefined,
            incoming: FeedPage,
            { args, readField }: FeedMergeOptions,
          ): FeedPage {
            // первая страница (без курсора) заменяет; следующие — дописываются
            if (!args?.cursor) return incoming;
            // merge идемпотентен: дедуп по id, чтобы повторная запись той же
            // страницы (напр. гонка fetchMore) не продублировала посты
            const existingItems = existing?.items ?? [];
            const seen = new Set(
              existingItems.map((r) => readField("id", r as Reference)),
            );
            const fresh = incoming.items.filter(
              (r) => !seen.has(readField("id", r as Reference)),
            );
            return { ...incoming, items: [...existingItems, ...fresh] };
          },
        },
      },
    },
  },
});

// Хранилище с защитой от переполнения квоты localStorage. Свой враппер вместо
// LocalStorageWrapper НАМЕРЕННО: библиотечный maxSize при превышении УДАЛЯЕТ
// хороший снапшот и НАВСЕГДА выключает персист (внутренний persistor.paused,
// который resume() не сбрасывает). Вместо этого мы отключаем maxSize и просто
// глотаем QuotaExceededError у setItem — прошлый снапшот остаётся, а как только
// кэш ужмётся (logout → clearStore), запись снова проходит. Само-восстановление.
const quotaSafeStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  removeItem: (key: string) => window.localStorage.removeItem(key),
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // квота исчерпана → пропускаем запись, сохраняя последний валидный снапшот
    }
  },
};

// Персист нормализованного кэша в localStorage: приложение стартует с данными
// мгновенно (cache-first читает из восстановленного кэша) и работает офлайн на
// чтение. trigger:"write" сбрасывает снапшот при изменениях кэша (с дебаунсом).
// apollo3-cache-persist работает с кэшем по утиной типизации (extract/restore) —
// с Apollo Client 4 совместим, хотя peer в пакете заявлен на v3.
export const persistor = new CachePersistor({
  cache: cache as unknown as ConstructorParameters<
    typeof CachePersistor<unknown>
  >[0]["cache"],
  storage: quotaSafeStorage,
  key: PERSIST_KEY,
  maxSize: false, // потолок держит наш quotaSafeStorage (без перманентного отключения)
  trigger: "write",
  debounce: 500,
});

// вызывается в bootstrap ДО первого рендера: восстанавливаем кэш из localStorage,
// чтобы первый же cache-first-запрос отдал сохранённые данные без вспышки пустоты
export async function initCache(): Promise<void> {
  try {
    await persistor.restore();
  } catch {
    // битый/несовместимый снапшот не должен ронять старт — стартуем с пустого кэша
    await persistor.purge().catch(() => {});
  }
}

// на logout: снять данные прошлого пользователя с устройства (иначе следующий
// пользователь на том же браузере увидел бы чужой кэш из персиста).
// ВАЖНО: сначала pause(), потом purge(). clearStore() в logout пишет пустой кэш
// и по триггеру "write" планирует отложенный (debounce) persist — если не встать
// на паузу, он сработает ПОСЛЕ purge и заново создаст ключ. Пауза держится до
// следующего логина (resumePersistedCache), поэтому отложенный persist — no-op.
export async function purgePersistedCache(): Promise<void> {
  persistor.pause();
  await persistor.purge().catch(() => {});
}

// на login: снова включаем персист (после logout он на паузе)
export function resumePersistedCache(): void {
  persistor.resume();
}
