import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../features/auth/AuthProvider";

// Защита маршрута: без сессии — редирект на /login (с запоминанием, откуда пришли)
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
