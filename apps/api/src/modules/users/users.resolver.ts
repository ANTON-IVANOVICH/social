import { Args, ID, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { User } from "./models/user.model";
import { UsersService } from "./users.service";
import { FollowsService } from "./follows.service";

@Resolver(() => User)
export class UsersResolver {
  constructor(
    private readonly users: UsersService,
    private readonly follows: FollowsService,
  ) {}

  @Query(() => User)
  @Auth()
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.userId);
  }

  @Query(() => User, { nullable: true }) // публичный профиль
  user(@Args("username") username: string) {
    return this.users.findByUsername(username);
  }

  @Mutation(() => Boolean)
  @Auth()
  async follow(
    @Args("userId", { type: () => ID }) userId: string,
    @CurrentUser() me: AuthUser,
  ) {
    await this.follows.follow(me.userId, userId);
    return true;
  }

  @Mutation(() => Boolean)
  @Auth()
  unfollow(
    @Args("userId", { type: () => ID }) userId: string,
    @CurrentUser() me: AuthUser,
  ) {
    return this.follows.unfollow(me.userId, userId);
  }
}
