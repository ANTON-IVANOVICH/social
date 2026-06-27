import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma, User } from "@prisma/client";
import { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { REDIS_CLIENT } from "../../redis/redis.constants";
import { JwtPayload } from "../../common/types/auth-user";
import { PasswordService } from "./password.service";
import { RegisterInput } from "./dto/register.input";
import { LoginInput } from "./dto/login.input";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const REFRESH_TTL_SECONDS = REFRESH_TTL_MS / 1000;
const DENYLIST_PREFIX = "revoked:"; // быстрый кеш отозванных refresh-хешей в Redis

interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

// "15m" / "1h" / "3600s" / "30d" → секунды (advertised expiresIn = реальный TTL access-токена)
function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!m) return 900;
  const n = parseInt(m[1], 10);
  const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * mult[m[2] ?? "s"];
}

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    // advertised expiresIn берём из того же конфига, что подписывает токен —
    // чтобы заявленный срок жизни всегда совпадал с фактическим
    this.accessTtlSeconds = ttlToSeconds(
      config.get<string>("jwt.accessTtl") ?? "15m",
    );
  }

  async register(input: RegisterInput): Promise<User> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.user.create({
        data: {
          username: input.username,
          passwordHash,
          displayName: input.displayName,
        },
      });
    } catch (e) {
      // P2002 — нарушение уникального индекса (username занят)
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Это имя пользователя занято");
      }
      throw e;
    }
  }

  async login(input: LoginInput, meta: SessionMeta) {
    const user = await this.prisma.user.findUnique({
      where: { username: input.username },
    });

    // Защита от timing attack: verify выполняем ВСЕГДА, даже если пользователя нет.
    // Иначе по времени отклика можно перебирать существующие username.
    const dummyHash =
      "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0MTIzNDU2Nzg$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNo";
    const ok = await this.passwords.verify(
      user?.passwordHash ?? dummyHash,
      input.password,
    );

    if (!user || !ok || !user.isActive) {
      throw new UnauthorizedException("Неверные учётные данные");
    }

    const tokens = await this.issueTokens(user, meta);
    return { user, tokens };
  }

  async refresh(refreshToken: string, meta: SessionMeta) {
    const tokenHash = this.hashToken(refreshToken);

    // Быстрый путь: отозванный токен отсекаем по Redis-denylist без похода в Postgres.
    // Это лишь кеш — источник правды остаётся БД (атомарная ротация ниже).
    if (await this.isDenied(tokenHash)) {
      throw new UnauthorizedException("Недействительный refresh-токен");
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException("Недействительный refresh-токен");
    }

    // Атомарная ротация: отзываем токен ТОЛЬКО если он ещё активен (revokedAt: null).
    // Это закрывает гонку «check-then-update» — две параллельные попытки обменять
    // один токен не выдадут две живые пары: ровно одна получит count===1.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (revoked.count !== 1) {
      // токен уже использован/отозван → гонка или reuse украденного токена.
      // Reuse-detection: отзываем всю «семью» активных токенов пользователя и
      // заносим хеши в denylist, чтобы будущие попытки отсекались быстро.
      const family = await this.prisma.refreshToken.findMany({
        where: { userId: record.userId, revokedAt: null },
        select: { tokenHash: true },
      });
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await Promise.all([
        this.deny(tokenHash),
        ...family.map((t) => this.deny(t.tokenHash)),
      ]);
      throw new UnauthorizedException("Недействительный refresh-токен");
    }

    // ротированный (старый) токен — в denylist
    await this.deny(tokenHash);

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Пользователь не найден или заблокирован");
    }

    return this.issueTokens(user, meta);
  }

  async logout(refreshToken: string): Promise<boolean> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.deny(tokenHash);
    return true;
  }

  // denylist — best-effort кеш поверх БД. Любой сбой Redis НЕ ломает auth:
  // на запись просто логируем, на чтение fail-open (БД отловит reuse в любом случае).
  private async deny(tokenHash: string): Promise<void> {
    try {
      await this.redis.setex(
        `${DENYLIST_PREFIX}${tokenHash}`,
        REFRESH_TTL_SECONDS,
        "1",
      );
    } catch (e) {
      this.logger.warn(
        `denylist write failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private async isDenied(tokenHash: string): Promise<boolean> {
    try {
      return (await this.redis.get(`${DENYLIST_PREFIX}${tokenHash}`)) !== null;
    } catch (e) {
      this.logger.warn(
        `denylist read failed (fail-open): ${e instanceof Error ? e.message : e}`,
      );
      return false; // fail-open: БД остаётся источником правды
    }
  }

  private async issueTokens(user: User, meta: SessionMeta) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload); // секрет/TTL из JwtModule

    const refreshToken = randomBytes(48).toString("base64url");
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds };
  }

  private hashToken(token: string): string {
    // refresh-токен сам по себе случайный 48-байтный — медленный argon2 не нужен,
    // SHA-256 достаточно и быстро
    return createHash("sha256").update(token).digest("hex");
  }
}
