import {
  Directive,
  Field,
  GraphQLISODateTime,
  ID,
  ObjectType,
  registerEnumType,
} from "@nestjs/graphql";
import { ReactionType } from "@prisma/client";

registerEnumType(ReactionType, { name: "ReactionType" });

@ObjectType()
@Directive('@key(fields: "id")')
export class Reaction {
  @Field(() => ID)
  id: string;

  @Field(() => ReactionType)
  type: ReactionType;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  userId: string;
  postId: string;
}
