import { Command } from "@nestjs/cqrs";

export class DeletePostCommand extends Command<boolean> {
  constructor(public readonly postId: string) {
    super();
  }
}
