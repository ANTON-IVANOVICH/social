import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtSignOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { AuthResolver } from "./auth.resolver";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      // global: JwtService доступен и SubscriptionContextService (онлайн-аутентификация
      // WS-подписок), а не только AuthModule
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("jwt.secret"),
        // expiresIn принимает ms-строку ("15m"); тип ms.StringValue из @nestjs/jwt
        // слишком узок для generic-строки из конфига — приводим явно.
        signOptions: {
          expiresIn: config.get<string>(
            "jwt.accessTtl",
          ) as unknown as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  providers: [AuthService, PasswordService, JwtStrategy, AuthResolver],
})
export class AuthModule {}
