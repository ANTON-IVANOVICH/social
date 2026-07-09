import { Directive, Field, ID, ObjectType } from "@nestjs/graphql";
import { Post } from "./post.model";

// РАСШИРЕНИЕ чужой сущности. Владелец User — users-subgraph; здесь мы лишь
// добавляем к нему поле posts.
//
// @extends — «тип объявлен не тут»; @external на id — «поле принадлежит другому
// subgraph'у, я им только пользуюсь как ключом». Резолвер ссылки писать не нужно:
// @apollo/subgraph по умолчанию отдаёт само представление { __typename, id },
// а этого хватает, чтобы отрезолвить posts по user.id.
@ObjectType()
@Directive('@key(fields: "id")')
@Directive("@extends")
export class User {
  @Field(() => ID)
  @Directive("@external")
  id: string;

  @Field(() => [Post])
  posts?: Post[]; // вклад posts-subgraph'а в общий тип User
}
