import { Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";
import { MediaService } from "./media.service";

// защита от pixel-бомб: маленький файл может разворачиваться в гигантский
// растр — ограничиваем и площадь входа (~25 МП хватает любому фото),
// и время обработки
const SHARP_INPUT = { limitInputPixels: 25_000_000 };
const SHARP_TIMEOUT = { seconds: 15 };

// Тяжёлая обработка картинки (ресайз, webp, превью) — в фоне, ответ мутации её
// не ждёт. Пока это fire-and-forget в том же процессе; с появлением очередей
// (BullMQ) переедет в отдельный воркер без изменения контракта process(key).
@Injectable()
export class MediaProcessor {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(private readonly media: MediaService) {}

  async process(key: string): Promise<void> {
    const src = this.media.pathFor(key);
    // авто-ориентация по EXIF, ресайз без увеличения, конвертация в webp;
    // метаданные (включая GPS) в производные не копируются
    await sharp(src, SHARP_INPUT)
      .timeout(SHARP_TIMEOUT)
      .rotate()
      .resize({ width: 512, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(`${src}.webp`);
    await sharp(src, SHARP_INPUT)
      .timeout(SHARP_TIMEOUT)
      .rotate()
      .resize({ width: 96 })
      .webp({ quality: 75 })
      .toFile(`${src}_thumb.webp`);
  }

  // запуск в фоне: ошибка обработки логируется, но загрузку не ломает —
  // оригинал уже сохранён и отдаётся как есть
  enqueue(key: string): void {
    this.process(key).catch((err: unknown) => {
      this.logger.error(
        `Обработка изображения ${key} не удалась: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }
}
