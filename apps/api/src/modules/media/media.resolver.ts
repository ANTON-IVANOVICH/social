import { UseGuards } from "@nestjs/common";
import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";
import { GraphQLUpload, type FileUpload } from "graphql-upload-minimal";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GqlThrottlerGuard } from "../../common/guards/gql-throttler.guard";
import { AuthUser } from "../../common/types/auth-user";
import { User } from "../users/models/user.model";
import { UsersService } from "../users/users.service";
import { MediaService } from "./media.service";
import { MediaProcessor } from "./media.processor";

@Resolver()
export class MediaResolver {
  constructor(
    private readonly media: MediaService,
    private readonly users: UsersService,
    private readonly processor: MediaProcessor,
  ) {}

  // Файл едет multipart-запросом (спека GraphQL multipart request): значение
  // скаляра Upload в рантайме — ПРОМИС деталей файла, поэтому ниже await.
  // ВАЖНО: TS-тип параметра намеренно НЕ Promise<FileUpload> — иначе метаданные
  // параметра были бы Promise, и глобальный ValidationPipe (transform: true)
  // пересоздал бы значение через `new Promise(undefined)` и сломал загрузку;
  // с типом-объектом (Object в метаданных) пайп аргумент не трогает.
  // Ответ не ждёт обработки — клиент сразу получает обновлённого User,
  // webp-производные досчитываются в фоне.
  @Mutation(() => User)
  @Auth()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600_000 } }) // диск и sharp не бесплатные
  async uploadAvatar(
    @Args("file", { type: () => GraphQLUpload }) file: FileUpload,
    @CurrentUser() user: AuthUser,
  ): Promise<User> {
    const { createReadStream, mimetype } = await file;

    // старый аватар запоминаем ДО замены — после успешного апдейта подчистим
    const prevUrl = (await this.users.findById(user.userId))?.avatarUrl;

    const key = await this.media.store(
      createReadStream(),
      user.userId,
      mimetype,
    );

    let updated: User;
    try {
      updated = await this.users.updateAvatar(
        user.userId,
        this.media.urlFor(key),
      );
    } catch (err) {
      // БД не приняла — не оставляем осиротевший файл
      await this.media.remove(key);
      throw err;
    }

    this.processor.enqueue(key); // ресайз/превью — в фоне

    // прежний файл больше никому не нужен (URL уже не в БД) — убираем в фоне;
    // чужие/внешние URL keyFromUrl отфильтрует
    const prevKey = prevUrl ? this.media.keyFromUrl(prevUrl) : null;
    if (prevKey && prevKey !== key) void this.media.remove(prevKey);

    return updated;
  }
}
