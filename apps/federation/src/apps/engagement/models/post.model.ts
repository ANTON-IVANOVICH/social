import { Directive, Field, ID, Int, ObjectType } from "@nestjs/graphql";
import { Reaction } from "./reaction.model";

// Третий subgraph расширяет ЧУЖОЙ Post (владелец — posts) своими полями.
// Post при этом остаётся одним типом в supergraph'е: gateway склеит контент из
// posts со счётчиком реакций отсюда. Разные команды — разные части одного типа.
@ObjectType()
@Directive('@key(fields: "id")')
@Directive("@extends")
export class Post {
  @Field(() => ID)
  @Directive("@external")
  id: string;

  @Field(() => Int)
  reactionCount?: number;

  @Field(() => [Reaction])
  reactions?: Reaction[];
}
