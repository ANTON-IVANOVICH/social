import { UseGuards } from "@nestjs/common";
import {
  Args,
  Query,
  ResolveReference,
  Resolver,
} from "@nestjs/graphql";
import { AuthUser } from "../../libs/common/auth-user";
import { CurrentUser } from "../../libs/common/current-user.decorator";
import { GqlAuthGuard } from "../../libs/common/gql-auth.guard";
import { SubgraphContext } from "../../libs/common/subgraph-context";
import { UsersLoaders } from "./users.loaders";
import { UsersService } from "./users.service";
import { User } from "./models/user.model";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly users: UsersService) {}

  @Query(() => User, { nullable: true })
  user(@Args("username") username: string) {
    return this.users.findByUsername(username);
  }

  // Доказательство, что auth доезжает до subgraph'а: gateway пробросил заголовок,
  // а токен проверил ЭТОТ процесс (см. GqlAuthGuard).
  @Query(() => User, { nullable: true })
  @UseGuards(GqlAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.userId);
  }

  // Зовётся gateway'ем, когда ДРУГОЙ subgraph вернул ссылку { __typename, id }.
  //
  // Параметры БЕЗ декораторов — это важно: Nest тогда биндит метод напрямую и
  // он получает подпись graphql-резолвера ссылки (reference, context, info).
  // С @Context() было бы иначе: у __resolveReference нет слота args, и декоратор
  // вернул бы info вместо контекста.
  @ResolveReference()
  resolveReference(
    reference: { __typename: string; id: string },
    context: SubgraphContext<UsersLoaders>,
  ) {
    return context.loaders.userById.load(reference.id);
  }
}
