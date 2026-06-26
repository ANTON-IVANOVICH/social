import { Field, Int, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class TokenPair {
  @Field()
  accessToken: string;

  // refresh-токен отдаём в httpOnly-cookie, в теле — null (защита от XSS).
  // Поле оставлено для не-браузерных клиентов, читающих Set-Cookie.
  @Field(() => String, { nullable: true })
  refreshToken: string | null;

  @Field(() => Int)
  expiresIn: number; // секунд до истечения access-токена
}
