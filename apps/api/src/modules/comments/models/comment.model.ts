import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class Comment {
  @Field(() => ID)
  id: string;

  @Field()
  content: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  // НЕ @Field — нужны field-резолверу author и фильтру подписки, в схему не отдаём
  authorId: string;
  postId: string;
}
