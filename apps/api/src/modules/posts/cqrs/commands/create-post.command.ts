import { Command } from "@nestjs/cqrs";
import { Post } from "@prisma/client";
import { CreatePostInput } from "../../dto/create-post.input";

// Команда = НАМЕРЕНИЕ записи (что сделать), а не действие. Обработчик владеет
// транзакцией. Дженерик Command<Post> типизирует результат commandBus.execute().
export class CreatePostCommand extends Command<Post> {
  constructor(
    public readonly authorId: string,
    public readonly input: CreatePostInput,
  ) {
    super();
  }
}
