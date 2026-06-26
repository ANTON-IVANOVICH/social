import { Field, ObjectType } from "@nestjs/graphql";
import { User } from "../../users/models/user.model";

@ObjectType()
export class SuggestedUser {
  @Field(() => User)
  user: User;

  @Field()
  reason: string;
}
