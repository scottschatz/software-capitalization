-- CreateTable
CREATE TABLE "model_events" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_type" TEXT NOT NULL,
    "model_attempted" TEXT NOT NULL,
    "model_used" TEXT,
    "target_date" TEXT,
    "error_message" TEXT,
    "attempt" INTEGER,
    "latency_ms" INTEGER,
    "prompt" TEXT NOT NULL DEFAULT 'generation',

    CONSTRAINT "model_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_events_timestamp_idx" ON "model_events"("timestamp");

-- CreateIndex
CREATE INDEX "model_events_event_type_idx" ON "model_events"("event_type");

-- CreateIndex
CREATE INDEX "model_events_target_date_idx" ON "model_events"("target_date");
