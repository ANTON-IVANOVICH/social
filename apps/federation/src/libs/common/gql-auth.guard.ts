import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { JwtService } from "@nestjs/jwt";
import { AuthUser, JwtPayload } from "./auth-user";
import { SubgraphContext } from "./subgraph-context";

// Gateway НЕ проверяет токен — он лишь пробрасывает заголовок. Проверку делает
// каждый subgraph сам: gateway не должен быть точкой доверия, за которой всё
// открыто (иначе прямой запрос в subgraph минует авторизацию).
@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context).getContext<SubgraphContext>();
    const header = ctx.req?.headers?.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Требуется Bearer-токен");
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      ctx.req.user = {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
      } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException("Токен недействителен");
    }
  }
}
