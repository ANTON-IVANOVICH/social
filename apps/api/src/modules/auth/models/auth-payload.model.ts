import { Field, ObjectType } from "@nestjs/graphql";
import { User } from "../../users/models/user.model";
import { TokenPair } from "./token-pair.model";

@ObjectType()
export class AuthPayload {
  @Field(() => User)
  user: User;

  @Field(() => TokenPair)
  tokens: TokenPair;
}
