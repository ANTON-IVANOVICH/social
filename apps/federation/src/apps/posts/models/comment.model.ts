import {
  Directive,
  Field,
  GraphQLISODateTime,
  ID,
  ObjectType,
} from "@nestjs/graphql";

@ObjectType()
@Directive('@key(fields: "id")')
export class Comment {
  @Field(() => ID)
  id: string;

  @Field()
  content: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  authorId: string;
  postId: string;
}
