import {
  Field,
  GraphQLISODateTime,
  ID,
  InterfaceType,
  ObjectType,
} from "@nestjs/graphql";
import { NotificationKind } from "@prisma/client";
import { User } from "../../users/models/user.model";
import { Post } from "../../posts/models/post.model";

@InterfaceType({
  // по полю kind из БД выбираем конкретный GraphQL-тип
  resolveType(value: { kind: NotificationKind }) {
    switch (value.kind) {
      case "FOLLOW":
        return FollowNotification;
      case "REACTION":
        return ReactionNotification;
      case "COMMENT":
        return CommentNotification;
    }
  },
})
export abstract class Notification {
  @Field(() => ID)
  id: string;

  @Field()
  read: boolean;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType({ implements: () => [Notification] })
export class FollowNotification extends Notification {
  @Field(() => User)
  follower: User; // кто подписался
}

@ObjectType({ implements: () => [Notification] })
export class ReactionNotification extends Notification {
  @Field(() => User)
  actor: User; // кто отреагировал

  @Field(() => Post)
  post: Post;
}

@ObjectType({ implements: () => [Notification] })
export class CommentNotification extends Notification {
  @Field(() => User)
  actor: User;

  @Field(() => Post)
  post: Post;
}
