import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { PrismaService } from "../../../../prisma/prisma.service";
import { DeletePostCommand } from "../commands/delete-post.command";

@CommandHandler(DeletePostCommand)
export class DeletePostHandler implements ICommandHandler<DeletePostCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeletePostCommand): Promise<boolean> {
    await this.prisma.post.delete({ where: { id: command.postId } });
    return true;
  }
}
