import { Directive, Field, ID, ObjectType } from "@nestjs/graphql";

// Тип-заглушка: engagement ничего не добавляет к User, но обязан объявить его,
// чтобы вернуть ссылку из Reaction.user.
@ObjectType()
@Directive('@key(fields: "id")')
@Directive("@extends")
export class User {
  @Field(() => ID)
  @Directive("@external")
  id: string;
}
