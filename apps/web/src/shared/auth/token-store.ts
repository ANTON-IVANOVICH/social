// access-токен — в памяти: недоступен другим вкладкам, исчезает при перезагрузке
// (минимизирует поверхность атаки на короткоживущий токен). refresh-токен живёт в
// httpOnly-cookie, выставляемой бэкендом, — он JS НЕ доступен, поэтому здесь его не
// храним; браузер сам отправляет cookie при credentials:"include".
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export const tokenStore = {
  getAccess: (): string | null => accessToken,
  setAccess(token: string | null): void {
    if (token === accessToken) return; // без лишних событий
    accessToken = token;
    emit();
  },
  clear(): void {
    if (accessToken === null) return;
    accessToken = null;
    emit();
  },
  // Подписка на смену access-токена. WS-линк отдаёт токен в connectionParams лишь
  // один раз при connect, поэтому при тихом refresh он должен узнать о новом токене
  // и переподключиться — для этого и нужно это событие.
  subscribe(fn: (token: string | null) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function emit(): void {
  for (const fn of listeners) fn(accessToken);
}
