// Единая точка логирования ошибок. Сюда позже подключается Sentry/аналитика —
// три слоя ошибок (onUncaughtError / onCaughtError / Apollo) зовут именно её,
// поэтому формат и приёмник меняются в одном месте.
export function report(
  error: unknown,
  componentStack?: string | null,
  opts?: { fatal?: boolean },
): void {
  // fatal = не поймано ни одной ErrorBoundary (баг), иначе — корректно деградировали
  console.error(opts?.fatal ? "[FATAL]" : "[caught]", error, componentStack);
}
