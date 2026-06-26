import { ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  // ThrottlerGuard по умолчанию достаёт req/res из HTTP-контекста.
  // Для GraphQL переключаем извлечение на GraphQL-контекст.
  getRequestResponse(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context).getContext();
    return { req: ctx.req, res: ctx.res };
  }
}
