-- CreateTable
CREATE TABLE "period_locks" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "locked_by_id" TEXT,
    "locked_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "period_locks_year_month_key" ON "period_locks"("year", "month");

-- AddForeignKey
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
