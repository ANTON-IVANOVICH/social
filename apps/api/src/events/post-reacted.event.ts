import { ReactionType } from "@prisma/client";

export class PostReactedEvent {
  static readonly EVENT = "post.reacted";
  constructor(
    public readonly postId: string,
    public readonly actorId: string,
    public readonly postAuthorId: string,
    public readonly type: ReactionType,
  ) {}
}
