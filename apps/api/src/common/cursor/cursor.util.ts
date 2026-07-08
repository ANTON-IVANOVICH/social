// Курсор — непрозрачный (base64url) идентификатор последней записи страницы.
// Prisma делает по нему keyset-пагинацию, без OFFSET (который деградирует на
// больших таблицах). Клиент курсор не парсит — для него это чёрный ящик.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(id: string): string {
  return Buffer.from(id).toString("base64url");
}

export function decodeCursor(cursor: string): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return null;
  }
  // Buffer.from(base64url) на строку практически не бросает, поэтому одной try/catch
  // мало: валидируем форму. Курсор у нас — всегда UUID записи; что угодно иное →
  // «начинаем с начала» (иначе Prisma уронит запрос с P2023 на не-UUID-курсоре).
  return UUID_RE.test(decoded) ? decoded : null;
}

// Keyset-курсор ленты: пара (время поста в мс, id). id — тай-брейкер, иначе посты
// с одинаковым createdAt (одна миллисекунда — bulk-вставки) пропускались бы или
// дублировались на границе страниц. Постранично уходит в БД (page 2+), поэтому
// несёт полный ключ сортировки, а не только score.
export interface FeedCursor {
  ms: number;
  id: string;
}

export function encodeFeedCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.getTime()}.${id}`).toString("base64url");
}

export function decodeFeedCursor(cursor: string): FeedCursor | null {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const dot = decoded.indexOf(".");
  if (dot < 0) return null;
  const ms = decoded.slice(0, dot);
  const id = decoded.slice(dot + 1);
  // ms — целое, id — UUID; иначе курсор битый → «с начала»
  if (!/^\d+$/.test(ms) || !UUID_RE.test(id)) return null;
  return { ms: Number(ms), id };
}
