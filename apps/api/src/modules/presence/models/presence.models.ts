import { Field, ID, ObjectType } from "@nestjs/graphql";

// typing — эфемерный сигнал «пользователь печатает в посте»; нигде не хранится
@ObjectType()
export class TypingEvent {
  @Field(() => ID)
  postId: string;

  @Field(() => ID)
  userId: string;

  @Field()
  isTyping: boolean;
}

// presence — пользователь стал онлайн/офлайн (между инстансами через Redis)
@ObjectType()
export class PresenceEvent {
  @Field(() => ID)
  userId: string;

  @Field()
  online: boolean;
}
