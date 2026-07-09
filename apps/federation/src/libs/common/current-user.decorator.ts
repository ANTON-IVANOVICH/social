import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { AuthUser } from "./auth-user";
import { SubgraphContext } from "./subgraph-context";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    GqlExecutionContext.create(context).getContext<SubgraphContext>().req?.user,
);
