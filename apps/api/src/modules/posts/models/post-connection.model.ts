import { Field, ObjectType } from "@nestjs/graphql";
import { Post } from "./post.model";

@ObjectType()
export class PostConnection {
  @Field(() => [Post])
  items: Post[];

  @Field(() => String, { nullable: true })
  nextCursor: string | null;
}
