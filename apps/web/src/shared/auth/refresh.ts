import { tokenStore } from "./token-store";

let inFlight: Promise<string | null> | null = null;

// Несколько одновременных UNAUTHENTICATED должны вызвать ОДИН refresh, а не гонку:
// ротация на бэкенде одноразовая, параллельные refresh отозвали бы друг друга.
export function refreshSession(): Promise<string | null> {
  inFlight ??= doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<string | null> {
  // refresh-токен в httpOnly-cookie → credentials:"include", аргумент не нужен
  // (бэкенд читает cookie и делает ротацию, выставляя новую cookie сам).
  // СЫРОЙ fetch (не Apollo): иначе его UNAUTHENTICATED снова попал бы в error-link
  // → бесконечная рекурсия.
  let access: string | null = null;
  try {
    const res = await fetch(import.meta.env.VITE_API_URL, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "mutation { refresh { accessToken expiresIn } }",
      }),
    });
    const json: { data?: { refresh?: { accessToken?: string } } } =
      await res.json();
    access = json.data?.refresh?.accessToken ?? null;
  } catch {
    access = null;
  }

  if (!access) {
    tokenStore.clear(); // refresh недействителен/отсутствует → сессия закончилась
    return null;
  }
  tokenStore.setAccess(access);
  return access;
}
