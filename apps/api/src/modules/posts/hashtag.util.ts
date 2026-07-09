// Извлечение #хэштегов из текста поста. Живёт отдельно от сервиса: нужно
// обработчику команды записи, а сам сервис постов теперь только читает.
export function extractHashtags(content: string): string[] {
  const matches = content.match(/#(\w+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}
