import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";
import { PostVisibility } from "@prisma/client";
import { Node } from "../../../common/models/node.interface";
import "./enums"; // side-effect: регистрация PostVisibility/ReactionType в GraphQL

@ObjectType({ implements: () => [Node] })
export class Post implements Node {
  @Field(() => ID)
  id: string;

  @Field()
  content: string;

  @Field(() => PostVisibility)
  visibility: PostVisibility;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  // НЕ @Field — нужно резолверу author, но в схему не отдаём (не светим FK)
  authorId: string;
}
