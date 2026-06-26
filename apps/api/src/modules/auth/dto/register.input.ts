import { Field, InputType } from "@nestjs/graphql";
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

@InputType()
export class RegisterInput {
  @Field()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: "username: только буквы, цифры и _" })
  username: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(128) // max — защита от DoS на argon2
  password: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}
