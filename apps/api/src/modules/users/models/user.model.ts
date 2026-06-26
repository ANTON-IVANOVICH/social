import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";
import { UserRole } from "@prisma/client";
import { Node } from "../../../common/models/node.interface";
import "../../posts/models/enums"; // side-effect: регистрация UserRole/ReactionType/PostVisibility

@ObjectType({ implements: () => [Node] })
export class User implements Node {
  @Field(() => ID)
  id: string;

  @Field()
  username: string;

  @Field(() => UserRole)
  role: UserRole;

  // Явный () => String обязателен: TS-тип `string | null` отражается в метаданных
  // как Object, и без явного типа NestJS не выведет GraphQL-скаляр.
  @Field(() => String, { nullable: true })
  displayName?: string | null;

  @Field(() => String, { nullable: true })
  bio?: string | null;

  @Field(() => String, { nullable: true })
  avatarUrl?: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  // passwordHash в схему НЕ отдаём — поля нет в этой модели намеренно
}
