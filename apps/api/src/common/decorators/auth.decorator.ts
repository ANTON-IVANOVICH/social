import { applyDecorators, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { GqlAuthGuard } from "../guards/gql-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { Roles } from "./roles.decorator";

// @Auth() — просто залогинен; @Auth(UserRole.ADMIN) — залогинен и админ
export const Auth = (...roles: UserRole[]) =>
  applyDecorators(UseGuards(GqlAuthGuard, RolesGuard), Roles(...roles));
