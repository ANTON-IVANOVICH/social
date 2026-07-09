import { Injectable } from "@nestjs/common";
import { ICommand, ofType, Saga } from "@nestjs/cqrs";
import { map, Observable } from "rxjs";
import { ProcessMentionsCommand } from "./commands/process-mentions.command";
import { PostCreatedDomainEvent } from "./events/post-created.domain-event";

// Сага — process manager: слушает ПОТОК событий и порождает НОВЫЕ команды.
// Здесь она замыкает цикл «событие → команда»: пост создан → разобрать упоминания.
// Оркестрация живёт в саге, а не в обработчике команды создания — тот не должен
// знать про уведомления.
@Injectable()
export class PostSaga {
  @Saga()
  postCreated = (
    events$: Observable<PostCreatedDomainEvent>,
  ): Observable<ICommand> =>
    events$.pipe(
      ofType(PostCreatedDomainEvent),
      map(
        (event) =>
          new ProcessMentionsCommand(
            event.post.id,
            event.post.content,
            event.post.authorId,
          ),
      ),
    );
}
