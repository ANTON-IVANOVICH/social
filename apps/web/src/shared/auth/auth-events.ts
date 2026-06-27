type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();

// «refresh не удался» — централизованный сигнал, что сессия истекла на рантайме
// (а не просто «не залогинен» при старте). Слушатель в AuthProvider разлогинивает
// пользователя, после чего RequireAuth уводит с защищённых маршрутов на /login —
// вместо сломанного экрана от провалившегося запроса.
export function onSessionExpired(fn: Listener): () => void {
  sessionExpiredListeners.add(fn);
  return () => sessionExpiredListeners.delete(fn);
}

export function notifySessionExpired(): void {
  for (const fn of sessionExpiredListeners) fn();
}
