import { Field, ID, ObjectType } from "@nestjs/graphql";
import { ReactionType } from "@prisma/client";
import "../../posts/models/enums"; // side-effect: регистрация ReactionType в GraphQL

// полезная нагрузка подписки reactionAdded: кто и как отреагировал на пост
@ObjectType()
export class ReactionEvent {
  @Field(() => ID)
  postId: string;

  @Field(() => ID)
  userId: string;

  @Field(() => ReactionType)
  type: ReactionType;
}
