-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- Seed default agent schedule
INSERT INTO "system_settings" ("key", "value", "updated_at") VALUES
  ('agent.configVersion', '1', CURRENT_TIMESTAMP),
  ('agent.syncSchedule.weekday', 'Mon..Fri 08,10,12,14,16,18,23:00', CURRENT_TIMESTAMP),
  ('agent.syncSchedule.weekend', 'Sat,Sun 12,23:00', CURRENT_TIMESTAMP),
  ('agent.generateSchedule', '*-*-* 07:00:00', CURRENT_TIMESTAMP);
