import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthUser, JwtPayload } from "../../common/types/auth-user";
import { FollowsService } from "../users/follows.service";
import { PresenceService } from "./presence.service";

// то, что складываем в graphql-ws `extra` при установке соединения и читаем
// в `context` на каждой операции подписки
export interface SubscriptionExtra {
  user?: AuthUser;
  followingIds?: Set<string>;
}

@Injectable()
export class SubscriptionContextService {
  constructor(
    private readonly jwt: JwtService,
    private readonly follows: FollowsService,
    private readonly presence: PresenceService,
  ) {}

  // вызывается graphql-ws ОДИН раз при установке WS-соединения.
  // Браузерный WebSocket не умеет ставить заголовки на handshake → токен
  // приезжает в connectionParams, а не в Authorization.
  async onConnect(
    extra: SubscriptionExtra,
    params: Record<string, unknown>,
  ): Promise<void> {
    const header = (params?.authorization ?? params?.Authorization) as
      | string
      | undefined;
    const token = header?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Требуется токен авторизации");

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new Error("Недействительный токен");
    }

    const user: AuthUser = {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };

    // множество подписок грузим ОДИН раз — переиспользуется фильтром ленты postAdded.
    // Компромисс: подписки в середине сессии попадут в живую ленту лишь после reconnect.
    extra.followingIds = new Set(await this.follows.followingIds(user.userId));
    await this.presence.connected(user.userId);
    // user выставляем ПОСЛЕДНИМ: onDisconnect декрементит presence только при
    // наличии extra.user — так мы не уменьшим счётчик, если до presence.connected
    // что-то упало (иначе словили бы «фантомный» offline).
    extra.user = user;
  }

  async onDisconnect(extra: SubscriptionExtra): Promise<void> {
    // graphql-ws вызывает onDisconnect fire-and-forget. presence.disconnected уже
    // fail-safe, но оборачиваем ещё раз: ни одна ошибка отсюда не должна всплыть
    // необработанным промисом и уронить процесс.
    try {
      if (extra?.user) await this.presence.disconnected(extra.user.userId);
    } catch {
      // presence — best-effort; глушим
    }
  }
}
