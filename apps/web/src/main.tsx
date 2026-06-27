import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { ApolloProvider } from "@apollo/client/react";
import { apolloClient } from "./shared/apollo/client";
import { router } from "./app/router";
import { initTheme } from "./shared/theme/useTheme";
import "./index.css";

initTheme(); // применяем тему до первого рендера (без вспышки)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* ApolloProvider выше роутера → useQuery доступен на любом маршруте */}
    <ApolloProvider client={apolloClient}>
      <RouterProvider router={router} />
    </ApolloProvider>
  </StrictMode>,
);
