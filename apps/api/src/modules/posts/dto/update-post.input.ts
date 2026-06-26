import { Field, InputType } from "@nestjs/graphql";
import { PostVisibility } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

@InputType()
export class UpdatePostInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content?: string;

  @Field(() => PostVisibility, { nullable: true })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;
}
