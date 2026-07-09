import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Cron, CronExpression, Interval } from "@nestjs/schedule";
import { Queue } from "bullmq";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { FANOUT_QUEUE } from "../feed/feed.constants";
import { NOTIFICATIONS_QUEUE } from "../notifications/notifications.constants";
import {
  OUTBOX_POST_CREATED,
  PostCreatedOutboxPayload,
} from "./outbox.constants";

const BATCH = 20; // сколько строк забирает один тик
const MAX_ATTEMPTS = 5; // после стольких провалов строка уходит в failed
const TX_TIMEOUT_MS = 15_000; // транзакция держит блокировки — потолок обязателен
const RETENTION_DAYS = 7; // сколько держим разобранные строки перед уборкой

interface OutboxRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

// Relayer превращает таблицу outbox_events в распределённую очередь.
//
// FOR UPDATE SKIP LOCKED — ключ ко всему: обычный FOR UPDATE заставил бы соседние
// инстансы ЖДАТЬ занятые строки, а SKIP LOCKED велит их пропустить. N relayer'ов
// на N инстансах разбирают разные батчи без координатора и без конфликтов.
//
// Транзакция охватывает «забрал → доставил → пометил». Упал процесс посередине —
// Postgres откатит, строки снова pending, их подхватит другой инстанс. Повторная
// доставка безопасна: задачи ставятся с фиксированным jobId (BullMQ дедуплицирует).
@Injectable()
export class OutboxRelayer {
  private readonly logger = new Logger(OutboxRelayer.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(FANOUT_QUEUE) private readonly feedQueue: Queue,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notificationsQueue: Queue,
  ) {}

  @Interval(1000)
  async relay(): Promise<void> {
    if (this.busy) return; // тик не наслаивается на предыдущий
    this.busy = true;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Имена колонок — camelCase в кавычках: @@map переименовывает ТАБЛИЦУ,
          // а поля Prisma оставляет как в схеме (createdAt, а не created_at).
          const rows = await tx.$queryRaw<OutboxRow[]>`
            SELECT id, type, payload, attempts FROM outbox_events
            WHERE status = 'pending'
            ORDER BY "createdAt"
            LIMIT ${BATCH}
            FOR UPDATE SKIP LOCKED
          `;

          for (const row of rows) {
            // Ошибку ловим ПОСТРОЧНО. Иначе одна «ядовитая» строка валит всю
            // транзакцию, а она же — самая старая, значит попадёт и в следующий
            // батч: очередь встала бы навсегда на голове.
            try {
              await this.dispatch(row);
              await tx.outboxEvent.update({
                where: { id: row.id },
                data: { status: "processed", processedAt: new Date() },
              });
            } catch (err) {
              await this.markFailure(tx, row, err);
            }
          }
        },
        { timeout: TX_TIMEOUT_MS },
      );
    } catch (err) {
      // сюда попадают только сбои самой БД (взять батч / закоммитить) —
      // строки остались pending, следующий тик повторит
      this.logger.error("outbox relay failed", err as Error);
    } finally {
      this.busy = false;
    }
  }

  private async markFailure(
    tx: Prisma.TransactionClient,
    row: OutboxRow,
    err: unknown,
  ): Promise<void> {
    const attempts = row.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    const message = err instanceof Error ? err.message : String(err);

    await tx.outboxEvent.update({
      where: { id: row.id },
      data: {
        attempts,
        lastError: message.slice(0, 500),
        // исчерпав попытки, строка выходит из pending — она больше не мешает
        // остальным и остаётся видимой для разбора (status='failed')
        ...(exhausted ? { status: "failed", processedAt: new Date() } : {}),
      },
    });

    this.logger[exhausted ? "error" : "warn"](
      `outbox ${row.type} ${row.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`,
    );
  }

  // Durable-эффекты post.created: материализация ленты подписчиков и разбор
  // упоминаний. Оба переживут падение процесса — событие лежит в БД рядом с постом.
  //
  // Real-time publish (postAdded) сюда НЕ переезжает: он best-effort и уже случился
  // в обработчике доменного события, пока пользователь ждал ответа мутации.
  // Упоминания при этом тоже уходят СРАЗУ — их порождает сага; задача ниже лишь
  // подстраховывает, и на нормальном пути ничего не создаёт (гасит dedupeKey).
  private async dispatch(row: OutboxRow): Promise<void> {
    switch (row.type) {
      case OUTBOX_POST_CREATED: {
        const payload = row.payload as unknown as PostCreatedOutboxPayload;
        // BullMQ запрещает ":" в кастомном jobId — используем "-".
        await this.feedQueue.add("fanout", payload, {
          jobId: `fanout-${payload.postId}`,
        });
        await this.notificationsQueue.add(
          "mentions",
          { postId: payload.postId },
          { jobId: `mentions-${payload.postId}` },
        );
        return;
      }
      default:
        // неизвестный тип — код и данные разъехались; пусть отработает счётчик
        // попыток и строка честно уедет в failed, а не крутится вечно
        throw new Error(`unknown outbox event type: ${row.type}`);
    }
  }

  // Разобранные строки — журнал, а не данные: без уборки таблица растёт на строку
  // с каждым постом навсегда. failed держим столько же — их должен успеть увидеть
  // человек, а не только графики.
  @Cron(CronExpression.EVERY_HOUR)
  async prune(): Promise<void> {
    const threshold = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.outboxEvent.deleteMany({
      // фильтр по (status, createdAt) ложится на существующий составной индекс
      where: { status: { in: ["processed", "failed"] }, createdAt: { lt: threshold } },
    });
    if (count > 0) this.logger.log(`outbox: убрано ${count} разобранных строк`);
  }
}
