import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@heroui/react";

interface Props {
  children: ReactNode;
  /** кастомный фолбэк; по умолчанию — карточка с ошибкой и кнопкой «повторить» */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}
interface State {
  error: Error | null;
}

// React 19 не даёт компонент-границу ошибок из коробки — нужен класс с
// getDerivedStateFromError/componentDidCatch. Именно сюда проваливаются ошибки
// suspense-хуков (loading ловит <Suspense>, throw — эта граница).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // централизованная точка лога (позже — onCaughtError + архитектура ошибок)
    console.error("ErrorBoundary:", error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="m-6 flex flex-col items-start gap-3">
        <div className="text-danger">Что-то пошло не так: {error.message}</div>
        <Button variant="ghost" onPress={this.reset}>
          Повторить
        </Button>
      </div>
    );
  }
}
