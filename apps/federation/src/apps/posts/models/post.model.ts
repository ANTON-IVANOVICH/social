import {
  Directive,
  Field,
  GraphQLISODateTime,
  ID,
  ObjectType,
} from "@nestjs/graphql";

// Собственная сущность posts-subgraph'а. authorId НЕ поле графа — это внутренний
// ключ, из которого резолвер собирает ссылку на User чужого subgraph'а.
@ObjectType()
@Directive('@key(fields: "id")')
export class Post {
  @Field(() => ID)
  id: string;

  @Field()
  content: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  authorId: string;
}
