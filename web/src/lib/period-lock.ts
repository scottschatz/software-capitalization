import { prisma } from '@/lib/prisma'

export async function assertPeriodOpen(date: Date): Promise<void> {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1

  const lock = await prisma.periodLock.findUnique({
    where: { year_month: { year, month } },
  })

  if (lock?.status === 'locked') {
    throw new PeriodLockedError(year, month)
  }
}

export class PeriodLockedError extends Error {
  public year: number
  public month: number
  constructor(year: number, month: number) {
    super(`Period ${year}-${String(month).padStart(2, '0')} is locked and cannot be modified`)
    this.name = 'PeriodLockedError'
    this.year = year
    this.month = month
  }
}
