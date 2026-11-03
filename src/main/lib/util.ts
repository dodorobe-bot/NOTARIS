import type { PaginationInput } from '../../shared/schemas'
import { APP_TIMEZONE } from '../../shared/format'
import { MAX_PAGING_OFFSET, pageOffset, pageTooDeep } from '../../shared/pagination'
import { endOfZonedDay, fromZonedParts, startOfZonedDay, startOfZonedMonth } from './time'
import { ConflictError } from './errors'

export function paging(q: PaginationInput) {
  const skip = pageOffset(q.page, q.pageSize)
  if (pageTooDeep(skip)) {
    throw new ConflictError(
      `Halaman ${q.page} melewati batas ${MAX_PAGING_OFFSET.toLocaleString('id-ID')} baris pertama. Persempit pencarian atau gunakan filter agar data tetap cepat dimuat.`,
    )
  }
  return { skip, take: q.pageSize }
}

export function paginated<T>(items: T[], total: number, q: PaginationInput) {
  return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) }
}

export function parseJsonOrNull(value: string | null | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function dateOnlyInstant(value: string, end: boolean): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  return end ? endOfZonedDay(fromZonedParts(parts)) : startOfZonedDay(fromZonedParts(parts))
}

/** Rentang tanggal inklusif menurut zona waktu kantor (Asia/Jakarta). */
export function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined
  const range: { gte?: Date; lte?: Date } = {}
  if (from) range.gte = dateOnlyInstant(from, false) ?? new Date(from)
  if (to) range.lte = dateOnlyInstant(to, true) ?? new Date(to)
  return range
}

export function monthStart(date = new Date()): Date {
  return startOfZonedMonth(date, APP_TIMEZONE)
}

export function startOfToday(date = new Date()): Date {
  return startOfZonedDay(date, APP_TIMEZONE)
}

export function endOfToday(date = new Date()): Date {
  return endOfZonedDay(date, APP_TIMEZONE)
}

export function calcInvoiceTotals(items: { quantity: number; unitPrice: number }[], discount: number, taxPercent: number) {
  const subtotal = Math.round(items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0))
  const taxable = Math.max(0, subtotal - discount)
  const taxAmount = Math.round((taxable * taxPercent) / 100)
  return { subtotal, taxAmount, total: taxable + taxAmount }
}

export function invoiceStatusFor(total: number, paid: number, current: string): string {
  if (current === 'DRAFT' || current === 'VOID') return current
  if (paid <= 0) return 'UNPAID'
  if (paid >= total) return 'PAID'
  return 'PARTIAL'
}
