import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GqlContextType } from "@nestjs/graphql";
import { GraphQLError } from "graphql";

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

// HTTP-статус -> машиночитаемый код ошибки (единый для GraphQL и REST)
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHENTICATED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "UNPROCESSABLE_ENTITY",
  [HttpStatus.TOO_MANY_REQUESTS]: "TOO_MANY_REQUESTS",
};

/**
 * Глобальный exception-фильтр (GraphQL-aware).
 *
 * `formatError` причёсывает форму ответа, а этот фильтр — единая точка, где любое
 * исключение (доменное, валидационное, «не найдено», неизвестная 500) приводится
 * к единому виду с машинно-читаемым `code`. Работает в обоих транспортах:
 *  - GraphQL: возвращает `GraphQLError` с `extensions.code` → дальше её шлифует `formatError`;
 *  - HTTP (REST-контроллеры, напр. /health): пишет нормализованный JSON в response.
 *
 * Единая точка для `NotFoundException`, `ForbiddenException` и ошибок валидации
 * `InputType` — все приводятся к ответу с машинно-читаемым `code`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): GraphQLError | void {
    const normalized = this.normalize(exception);
    this.log(exception, normalized);

    if (host.getType<GqlContextType>() === "graphql") {
      // В GraphQL нет response-объекта: возвращаем GraphQLError — её подхватит
      // formatError и приведёт к { message, code, path }.
      return new GraphQLError(normalized.message, {
        extensions: {
          code: normalized.code,
          ...(normalized.details ? { details: normalized.details } : {}),
        },
      });
    }

    // HTTP-ветка: единый JSON для контроллеров и инфраструктурных проб.
    const res = host.switchToHttp().getResponse();
    res.status(normalized.status).json({
      statusCode: normalized.status,
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): NormalizedError {
    const isProd = this.config.get<string>("nodeEnv") === "production";

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      let message = exception.message;
      let details: unknown;

      // ValidationPipe бросает BadRequestException с массивом message
      if (typeof response === "object" && response !== null) {
        const body = response as Record<string, unknown>;
        if (Array.isArray(body.message)) {
          details = body.message;
          message = "Validation failed";
        } else if (typeof body.message === "string") {
          message = body.message;
        }
      }

      let code =
        this.extractCustomCode(response) ?? CODE_BY_STATUS[status] ?? "HTTP_ERROR";

      // 5xx — это сбой, а не доменная ошибка: стабильный код + маскировка в проде
      // (даже если это HttpException с описательным сообщением). Реальный текст
      // остаётся в логах (log() пишет 5xx с трейсом).
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        code = this.extractCustomCode(response) ?? "INTERNAL_SERVER_ERROR";
        if (isProd) {
          message = "Internal server error";
          details = undefined;
        }
      }

      return { status, code, message, details };
    }

    // Неизвестная ошибка -> 500. В проде не раскрываем внутренние детали.
    const message =
      !isProd && exception instanceof Error
        ? exception.message
        : "Internal server error";

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message,
    };
  }

  // Доменное исключение может само нести машиночитаемый код в теле ответа.
  private extractCustomCode(response: unknown): string | undefined {
    if (typeof response === "object" && response !== null) {
      const code = (response as Record<string, unknown>).code;
      if (typeof code === "string") return code;
    }
    return undefined;
  }

  private log(exception: unknown, n: NormalizedError): void {
    const stack = exception instanceof Error ? exception.stack : undefined;
    // 5xx — реальные сбои (с трейсом), 4xx — ожидаемые доменные ошибки.
    if (n.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${n.code}: ${n.message}`, stack);
    } else {
      this.logger.warn(`${n.code}: ${n.message}`);
    }
  }
}
