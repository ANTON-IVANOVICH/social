import { Field, Int, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class TrendingHashtag {
  @Field()
  tag: string;

  @Field(() => Int)
  count: number;
}
