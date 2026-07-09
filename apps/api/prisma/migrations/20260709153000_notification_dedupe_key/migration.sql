-- Ключ идемпотентности уведомления. NULL не конфликтует с NULL в PostgreSQL,
-- поэтому уникальность действует только для тех уведомлений, что его заполняют
-- (упоминания: их может создать и сага, и outbox-релеер).
ALTER TABLE "notifications" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
