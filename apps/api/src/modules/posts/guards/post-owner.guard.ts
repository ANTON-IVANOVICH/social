import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { PostsService } from "../posts.service";

@Injectable()
export class PostOwnerGuard implements CanActivate {
  constructor(private readonly posts: PostsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const { user } = ctx.getContext().req;
    const { id } = ctx.getArgs<{ id: string }>();

    const post = await this.posts.findById(id);
    if (!post) throw new NotFoundException("Пост не найден");

    // владелец или админ
    if (post.authorId !== user.userId && user.role !== "ADMIN") {
      throw new ForbiddenException("Можно изменять только свои посты");
    }
    return true;
  }
}
