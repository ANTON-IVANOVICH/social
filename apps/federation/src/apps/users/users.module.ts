import { Module } from "@nestjs/common";
import { AuthModule } from "../../libs/common/auth.module";
import { PrismaModule } from "../../libs/common/prisma.module";
import { subgraphGraphQLModule } from "../../libs/common/subgraph";
import { createUsersLoaders } from "./users.loaders";
import { UsersResolver } from "./users.resolver";
import { UsersService } from "./users.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    subgraphGraphQLModule(
      "src/apps/users/schema.gql",
      createUsersLoaders,
    ),
  ],
  providers: [UsersService, UsersResolver],
})
export class UsersSubgraphModule {}
