import { UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Args, Context, Mutation, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { GqlAuthGuard } from "../../common/guards/gql-auth.guard";
import { GqlThrottlerGuard } from "../../common/guards/gql-throttler.guard";
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  setRefreshCookie,
} from "../../common/cookies/refresh-cookie";
import { User } from "../users/models/user.model";
import { AuthPayload } from "./models/auth-payload.model";
import { TokenPair } from "./models/token-pair.model";
import { RegisterInput } from "./dto/register.input";
import { LoginInput } from "./dto/login.input";
import { AuthService } from "./auth.service";

interface GqlCtx {
  req: Request & { cookies?: Record<string, string> };
  res: Response;
}

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Resolver()
export class AuthResolver {
  private readonly isProd: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.isProd = config.get<string>("nodeEnv") === "production";
  }

  private meta(ctx: GqlCtx) {
    return {
      userAgent: ctx.req.headers["user-agent"],
      ipAddress: ctx.req.ip,
    };
  }

  // refresh-токен кладём в httpOnly-cookie; в теле его не отдаём (null)
  private withCookie(res: Response, tokens: IssuedTokens): TokenPair {
    setRefreshCookie(res, tokens.refreshToken, this.isProd);
    return {
      accessToken: tokens.accessToken,
      refreshToken: null,
      expiresIn: tokens.expiresIn,
    };
  }

  private resolveRefresh(ctx: GqlCtx, arg?: string): string {
    // браузер — из cookie; не-браузерный клиент может прислать аргументом
    const token = arg ?? ctx.req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException("Refresh-токен не передан");
    return token;
  }

  @Mutation(() => User)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600_000 } }) // 5 регистраций / час с IP
  register(@Args("input") input: RegisterInput) {
    return this.auth.register(input);
  }

  @Mutation(() => AuthPayload)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900_000 } }) // 10 попыток входа / 15 мин
  async login(
    @Args("input") input: LoginInput,
    @Context() ctx: GqlCtx,
  ): Promise<AuthPayload> {
    const { user, tokens } = await this.auth.login(input, this.meta(ctx));
    return { user, tokens: this.withCookie(ctx.res, tokens) };
  }

  @Mutation(() => TokenPair)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  async refresh(
    @Context() ctx: GqlCtx,
    @Args("refreshToken", { nullable: true }) refreshToken?: string,
  ): Promise<TokenPair> {
    const tokens = await this.auth.refresh(
      this.resolveRefresh(ctx, refreshToken),
      this.meta(ctx),
    );
    return this.withCookie(ctx.res, tokens);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard) // logout требует валидный access-токен
  async logout(
    @Context() ctx: GqlCtx,
    @Args("refreshToken", { nullable: true }) refreshToken?: string,
  ): Promise<boolean> {
    const token = refreshToken ?? ctx.req.cookies?.[REFRESH_COOKIE];
    if (token) await this.auth.logout(token);
    clearRefreshCookie(ctx.res, this.isProd);
    return true;
  }
}
