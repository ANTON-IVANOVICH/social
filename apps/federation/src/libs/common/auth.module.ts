import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { requireEnv } from "./env";
import { GqlAuthGuard } from "./gql-auth.guard";

// Guard из монолита переехал сюда: в федерации он общий для всех subgraph'ов.
@Global()
@Module({
  imports: [JwtModule.register({ secret: requireEnv("JWT_SECRET") })],
  providers: [GqlAuthGuard],
  exports: [GqlAuthGuard, JwtModule],
})
export class AuthModule {}
