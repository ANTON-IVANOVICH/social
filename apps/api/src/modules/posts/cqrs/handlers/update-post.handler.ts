import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Post } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { UpdatePostCommand } from "../commands/update-post.command";

// Право на правку проверяет PostOwnerGuard на резолвере: команда выражает
// намерение, авторизацию решает граница транспорта.
@CommandHandler(UpdatePostCommand)
export class UpdatePostHandler implements ICommandHandler<UpdatePostCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute(command: UpdatePostCommand): Promise<Post> {
    return this.prisma.post.update({
      where: { id: command.postId },
      data: { ...command.input },
    });
  }
}
