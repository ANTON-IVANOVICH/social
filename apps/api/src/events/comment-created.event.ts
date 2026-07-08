import { Comment } from "@prisma/client";

export class CommentCreatedEvent {
  static readonly EVENT = "comment.created";
  constructor(
    public readonly comment: Comment,
    public readonly postAuthorId: string,
  ) {}
}
