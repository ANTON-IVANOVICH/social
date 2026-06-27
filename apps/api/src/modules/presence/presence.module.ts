import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { PresenceService } from "./presence.service";
import { PresenceResolver } from "./presence.resolver";
import { SubscriptionContextService } from "./subscription-context.service";

@Module({
  imports: [UsersModule], // → FollowsService для onConnect (загрузка followingIds)
  providers: [PresenceService, PresenceResolver, SubscriptionContextService],
  // PresenceService и SubscriptionContextService инжектятся в фабрику GraphQLModule
  exports: [PresenceService, SubscriptionContextService],
})
export class PresenceModule {}
