import { Query } from "@nestjs/cqrs";
import { FeedPage } from "../feed.service";

// Запрос = намерение ЧТЕНИЯ. Отдельная шина от команд: у чтения свой путь,
// свои источники (Redis-набор / БД) и никаких побочных эффектов.
export class GetFeedQuery extends Query<FeedPage> {
  constructor(
    public readonly userId: string,
    public readonly limit: number,
    public readonly cursor?: string,
  ) {
    super();
  }
}
