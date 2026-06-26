import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma, User } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtPayload } from "../../common/types/auth-user";
import { PasswordService } from "./password.service";
import { RegisterInput } from "./dto/register.input";
import { LoginInput } from "./dto/login.input";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
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
      // Reuse-detection: отзываем всю «семью» активных токенов пользователя.
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Недействительный refresh-токен");
    }

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
    return true;
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
