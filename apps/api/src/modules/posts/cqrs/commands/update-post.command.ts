import { Command } from "@nestjs/cqrs";
import { Post } from "@prisma/client";
import { UpdatePostInput } from "../../dto/update-post.input";

export class UpdatePostCommand extends Command<Post> {
  constructor(
    public readonly postId: string,
    public readonly input: UpdatePostInput,
  ) {
    super();
  }
}
