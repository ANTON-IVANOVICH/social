import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthUser, JwtPayload } from "../../../common/types/auth-user";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("jwt.secret"),
    });
  }

  // возвращённое отсюда станет req.user (его и отдаёт @CurrentUser)
  validate(payload: JwtPayload): AuthUser {
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}
