import { Module } from "@nestjs/common";
import { AuthModule } from "../../libs/common/auth.module";
import { PrismaModule } from "../../libs/common/prisma.module";
import { subgraphGraphQLModule } from "../../libs/common/subgraph";
import { createEngagementLoaders } from "./engagement.loaders";
import {
  PostEngagementResolver,
  ReactionsResolver,
} from "./engagement.resolver";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    subgraphGraphQLModule(
      "src/apps/engagement/schema.gql",
      createEngagementLoaders,
    ),
  ],
  providers: [ReactionsResolver, PostEngagementResolver],
})
export class EngagementSubgraphModule {}
