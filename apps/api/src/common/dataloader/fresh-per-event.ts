import DataLoader from "dataloader";
import { IDataLoaders } from "./dataloader.types";

// Контекст подписки (а с ним и DataLoader'ы) создаётся ОДИН раз на операцию
// subscribe и живёт всё время WS-подписки. Без сброса кэш лоадеров отдавал бы
// в каждом следующем событии данные первой загрузки (переименовался автор —
// а подписчики видят старое имя) и бесконечно рос. Обёртка чистит кэши перед
// доставкой каждого события — field-резолверы события тянут свежие данные.
export async function* freshLoadersPerEvent<T>(
  source: AsyncIterableIterator<T>,
  loaders: IDataLoaders,
): AsyncIterableIterator<T> {
  // for await корректно пробрасывает return()/throw() в source при отписке
  for await (const value of source) {
    for (const loader of Object.values(loaders) as DataLoader<never, unknown>[]) {
      loader.clearAll();
    }
    yield value;
  }
}
