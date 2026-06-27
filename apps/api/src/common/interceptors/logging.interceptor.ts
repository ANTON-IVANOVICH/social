import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { GqlContextType, GqlExecutionContext } from "@nestjs/graphql";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("GraphQL");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<GqlContextType>() !== "graphql") return next.handle();

    const info = GqlExecutionContext.create(context).getInfo<{
      parentType?: { name?: string };
      fieldName: string;
    }>();
    const parentType = info?.parentType?.name ?? "";
    // логируем только КОРНЕВЫЕ операции, а не каждый field-резолвер (их десятки
    // за один запрос ленты) — иначе один запрос дал бы десятки строк лога
    if (!["Query", "Mutation", "Subscription"].includes(parentType)) {
      return next.handle();
    }

    const op = `${parentType}.${info.fieldName}`;
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`${op} — ${Date.now() - start}ms`),
        error: (err: Error) =>
          this.logger.warn(
            `${op} failed — ${Date.now() - start}ms: ${err.message}`,
          ),
      }),
    );
  }
}
