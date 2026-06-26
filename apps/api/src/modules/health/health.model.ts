import { Field, Float, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class HealthStatus {
  @Field()
  status: string;

  @Field(() => Float)
  uptime: number;

  @Field()
  timestamp: string;

  @Field()
  env: string;
}
