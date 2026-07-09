import { Module } from "@nestjs/common";
import { FeedModule } from "../feed/feed.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OutboxRelayer } from "./outbox.relayer";

// Оба модуля реэкспортируют BullModule со своими очередями — relayer доставляет
// события ИМЕННО туда. Зависимость направлена «outbox → потребители», а не наоборот:
// ни лента, ни уведомления не знают, каким способом к ним пришло событие.
@Module({
  imports: [FeedModule, NotificationsModule],
  providers: [OutboxRelayer],
})
export class OutboxModule {}
