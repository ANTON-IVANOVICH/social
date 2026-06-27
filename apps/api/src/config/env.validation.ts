import { plainToInstance } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

export enum NodeEnv {
  Development = "development",
  Production = "production",
  Test = "test",
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  HOST: string = "0.0.0.0";

  @IsString()
  LOG_LEVEL: string = "info";

  // Максимальная глубина GraphQL-запроса (защита от слишком вложенных запросов)
  @IsNumber()
  @Min(1)
  @Max(50)
  GRAPHQL_MAX_DEPTH: number = 12;

  // Строка подключения к Postgres (обязательна — fail-fast при старте)
  @IsString()
  DATABASE_URL: string;

  // Redis: pub/sub для подписок между инстансами, shared-throttler, presence, denylist
  @IsString()
  REDIS_URL: string = "redis://localhost:6379";

  // Секрет для подписи JWT — минимум 32 символа (короткий секрет легко брутфорсить)
  @IsString()
  @MinLength(32, { message: "JWT_SECRET должен быть не короче 32 символов" })
  JWT_SECRET: string;

  @IsString()
  JWT_ACCESS_TTL: string = "15m";

  // Разрешённые origin'ы CORS в проде (через запятую). В dev origin рефлексируется.
  @IsOptional()
  @IsString()
  CLIENT_ORIGIN?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true, // '3000' (строка из env) -> 3000 (number)
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    // Падаем сразу при старте — лучше так, чем через час в проде с непонятной ошибкой
    throw new Error(errors.map((e) => e.toString()).join("\n"));
  }

  return validated;
}
