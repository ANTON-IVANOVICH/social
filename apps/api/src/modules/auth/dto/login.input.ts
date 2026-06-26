import { Field, InputType } from "@nestjs/graphql";
import { IsString, MaxLength, MinLength } from "class-validator";

@InputType()
export class LoginInput {
  @Field()
  @IsString()
  username: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
