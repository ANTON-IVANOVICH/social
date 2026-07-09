import { Request } from "express";
import { AuthUser } from "./auth-user";

// Каждый subgraph получает свой набор лоадеров, поэтому контекст параметризован.
// req нужен guard'у: gateway пробрасывает сюда исходный заголовок Authorization.
export interface SubgraphContext<TLoaders = unknown> {
  req: Request & { user?: AuthUser };
  loaders: TLoaders;
}
