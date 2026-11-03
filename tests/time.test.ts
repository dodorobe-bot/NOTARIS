import { describe, expect, it } from 'vitest'
import {
  endOfZonedDay,
  fromZonedParts,
  startOfZonedDay,
  startOfZonedMonth,
  startOfZonedMonthOffset,
  zonedDateKey,
  zonedMonthKey,
  zonedMonthKeyOffset,
} from '../src/main/lib/time'

describe('zona waktu kantor (Asia/Jakarta)', () => {
  it('memakai tanggal Jakarta, bukan tanggal UTC', () => {
    const lateUtc = new Date('2026-11-01T17:30:00.000Z')
    expect(zonedDateKey(lateUtc)).toBe('2026-11-02')
    expect(zonedMonthKey(lateUtc)).toBe('2026-11')
  })

  it('menghitung awal dan akhir hari Jakarta dalam UTC', () => {
    const noon = new Date('2026-11-02T05:00:00.000Z')
    expect(startOfZonedDay(noon).toISOString()).toBe('2026-11-01T17:00:00.000Z')
    expect(endOfZonedDay(noon).toISOString()).toBe('2026-11-02T16:59:59.999Z')
  })

  it('menghitung awal bulan menurut zona kantor', () => {
    expect(startOfZonedMonth(new Date('2026-11-01T01:00:00.000Z')).toISOString())
      .toBe('2026-10-31T17:00:00.000Z')
  })

  it('menggeser bulan tanpa terpengaruh zona mesin', () => {
    const now = new Date('2026-03-01T02:00:00.000Z')
    expect(zonedMonthKeyOffset(now, -5)).toBe('2025-10')
    expect(startOfZonedMonthOffset(now, -1).toISOString()).toBe('2026-01-31T17:00:00.000Z')
  })

  it('mengubah komponen lokal kantor menjadi instant UTC', () => {
    expect(fromZonedParts({ year: 2026, month: 11, day: 2, hour: 9, minute: 15 }).toISOString())
      .toBe('2026-11-02T02:15:00.000Z')
  })
})
