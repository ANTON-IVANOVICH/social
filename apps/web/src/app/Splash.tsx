// Фолбэк <Suspense>, пока AuthProvider определяет сессию (тихий refresh + me).
// Без него мелькало бы «разлогинен → залогинен».
export function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center text-default-500">
      Загрузка…
    </div>
  );
}
