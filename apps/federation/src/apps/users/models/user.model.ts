import {
  Directive,
  Field,
  GraphQLISODateTime,
  ID,
  ObjectType,
} from "@nestjs/graphql";

// ВЛАДЕЛЕЦ сущности User. @key объявляет глобальный ключ: по нему остальные
// subgraph'ы ссылаются на пользователя, ничего о его полях не зная.
@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  username: string;

  // тип задан явно: у `string | null` метаданные декоратора теряют конкретику
  @Field(() => String, { nullable: true })
  displayName?: string | null;

  @Field(() => String, { nullable: true })
  bio?: string | null;

  @Field(() => String, { nullable: true })
  avatarUrl?: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}
