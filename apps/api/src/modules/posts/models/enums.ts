import { registerEnumType } from "@nestjs/graphql";
import { PostVisibility, ReactionType, UserRole } from "@prisma/client";

// регистрируем СГЕНЕРИРОВАННЫЕ Prisma enum'ы в GraphQL — один источник значений
registerEnumType(ReactionType, { name: "ReactionType" });
registerEnumType(PostVisibility, { name: "PostVisibility" });
registerEnumType(UserRole, { name: "UserRole" });
