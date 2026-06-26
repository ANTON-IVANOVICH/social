import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { FollowsService } from "./follows.service";
import { UsersResolver } from "./users.resolver";

@Module({
  providers: [UsersService, FollowsService, UsersResolver],
  exports: [UsersService, FollowsService],
})
export class UsersModule {}
