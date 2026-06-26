import { ArgsType, Field, Int } from "@nestjs/graphql";
import { IsOptional, IsString, Max, Min } from "class-validator";

@ArgsType()
export class FeedArgs {
  @Field(() => Int, { defaultValue: 20 })
  @Min(1)
  @Max(50)
  limit: number;

  @Field({ nullable: true }) // курсорная пагинация
  @IsOptional()
  @IsString()
  cursor?: string;
}
