import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createWriteStream } from "node:fs";
import { mkdir, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

// принимаем только картинки: mimetype заявляет клиент, поэтому после записи
// сверяем сигнатуру (magic bytes) содержимого с заявленным типом.
// Расширение в ключе — чтобы статика отдавала корректный Content-Type.
const ALLOWED = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

// сигнатуры форматов: JPEG FF D8 FF; PNG 89 'PNG'; WebP: 'RIFF' ???? 'WEBP'
function matchesSignature(mimetype: string, head: Buffer): boolean {
  switch (mimetype) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case "image/webp":
      return (
        head.subarray(0, 4).toString("latin1") === "RIFF" &&
        head.subarray(8, 12).toString("latin1") === "WEBP"
      );
    default:
      return false;
  }
}

// ключи, которые мы сами выдаём (см. store) — только такие удаляем
const KEY_RE = /^uploads\/[0-9a-f-]+\/[0-9a-f-]+\.(?:jpg|png|webp)$/;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly baseDir = join(process.cwd(), "storage");

  constructor(private readonly config: ConfigService) {}

  // приём потока на диск. Ключ строим сами (uuid) — имя файла клиента в путь не
  // попадает, path traversal исключён. Абстракция «ключ → файл» позволит позже
  // заменить локальный диск на S3, не трогая резолвер.
  async store(
    stream: Readable,
    userId: string,
    mimetype: string,
  ): Promise<string> {
    const ext = ALLOWED.get(mimetype);
    if (!ext) {
      throw new BadRequestException("Недопустимый тип файла");
    }
    const key = `uploads/${userId}/${randomUUID()}${ext}`;
    const full = join(this.baseDir, key);
    await mkdir(dirname(full), { recursive: true });

    // Превышение maxFileSize у graphql-upload: busboy шлёт 'limit' и молча
    // обрубает данные БЕЗ ошибки/end — pipeline завис бы навсегда. Рушим поток
    // сами, чтобы запрос ответил 413, а не висел с открытым fd.
    stream.once("limit", () => {
      stream.destroy(
        new PayloadTooLargeException("Файл больше допустимого размера"),
      );
    });

    try {
      // pipeline корректно закрывает потоки и пробрасывает ошибки (не сырой .pipe())
      await pipeline(stream, createWriteStream(full));

      // содержимое должно соответствовать заявленному типу — «png», внутри
      // которого не PNG, не пойдёт ни в БД, ни в раздачу
      const fh = await open(full, "r");
      const head = Buffer.alloc(12);
      try {
        await fh.read(head, 0, 12, 0);
      } finally {
        await fh.close();
      }
      if (!matchesSignature(mimetype, head)) {
        throw new BadRequestException(
          "Содержимое файла не соответствует заявленному типу",
        );
      }
    } catch (err) {
      // оборванная/битая загрузка не должна оставлять файл на диске
      await unlink(full).catch(() => {});
      throw err;
    }
    return key;
  }

  pathFor(key: string): string {
    return join(this.baseDir, key);
  }

  // Абсолютный URL: фронтенд живёт на другом origin, относительный /static/…
  // разрешился бы против него. База настраивается (PUBLIC_URL) — за прокси или
  // в проде хост раздачи может отличаться от хоста API.
  urlFor(key: string): string {
    const base = this.config.get<string>("publicUrl", "http://localhost:3000");
    return `${base.replace(/\/$/, "")}/static/${key}`;
  }

  // обратная операция к urlFor: достать storage-ключ из сохранённого URL.
  // null — если URL чужой (не наш /static/) или ключ не нашей формы.
  keyFromUrl(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    if (!pathname.startsWith("/static/")) return null;
    const key = pathname.slice("/static/".length);
    return KEY_RE.test(key) ? key : null;
  }

  // удаление файла и его webp-производных (замена аватара, откат неудачной
  // загрузки). Best-effort: отсутствие файла — не ошибка
  async remove(key: string): Promise<void> {
    const full = this.pathFor(key);
    await Promise.all(
      [full, `${full}.webp`, `${full}_thumb.webp`].map((p) =>
        unlink(p).catch((err: NodeJS.ErrnoException) => {
          if (err.code !== "ENOENT") {
            this.logger.warn(`Не удалось удалить ${p}: ${err.message}`);
          }
        }),
      ),
    );
  }
}
