import { describe, expect, it } from 'vitest'
import { formatSequence } from '../src/main/lib/numbering'
import { calcInvoiceTotals, dateRange, invoiceStatusFor, paginated, paging } from '../src/main/lib/util'

describe('format penomoran', () => {
  const date = new Date(2026, 10, 2)

  it('mengganti seluruh token pola', () => {
    expect(formatSequence('{PREFIX}{YYYY}{MM}-{SEQ:4}', 7, date, 'TRX-')).toBe('TRX-202611-0007')
  })

  it('mendukung tahun dua digit dan Romawi', () => {
    expect(formatSequence('{SEQ:3}/{MM}/{YY}', 12, date, '')).toBe('012/11/26')
    expect(formatSequence('{SEQ:2}/{ROMAN}/{YYYY}', 3, date, '')).toBe('03/XI/2026')
  })

  it('menjaga lebar nomor urut', () => {
    expect(formatSequence('INV/{SEQ:6}', 42, date, '')).toBe('INV/000042')
    expect(formatSequence('{SEQ:1}', 42, date, '')).toBe('42')
  })

  it('memakai tanggal Asia/Jakarta, bukan tanggal mesin/UTC', () => {
    expect(formatSequence('{YYYY}{MM}{DD}', 1, new Date('2026-10-31T18:00:00.000Z'), '')).toBe('20261101')
    expect(formatSequence('{SEQ:2}/{ROMAN}/{YYYY}', 3, new Date('2026-10-31T18:00:00.000Z'), '')).toBe('03/XI/2026')
  })
})

describe('perhitungan invoice', () => {
  it('menghitung subtotal, diskon, pajak, dan total', () => {
    const t = calcInvoiceTotals(
      [{ quantity: 2, unitPrice: 1_000_000 }, { quantity: 1, unitPrice: 500_000 }],
      250_000,
      11,
    )
    expect(t.subtotal).toBe(2_500_000)
    expect(t.taxAmount).toBe(247_500)
    expect(t.total).toBe(2_497_500)
  })

  it('tidak menghasilkan pajak negatif saat diskon melebihi subtotal', () => {
    const t = calcInvoiceTotals([{ quantity: 1, unitPrice: 100_000 }], 500_000, 11)
    expect(t.taxAmount).toBe(0)
    expect(t.total).toBe(0)
  })

  it('membulatkan nilai pecahan ke rupiah', () => {
    const t = calcInvoiceTotals([{ quantity: 3, unitPrice: 333_333.4 }], 0, 0)
    expect(Number.isInteger(t.subtotal)).toBe(true)
    expect(t.total).toBe(t.subtotal)
  })
})

describe('status invoice', () => {
  it('menentukan status berdasarkan pembayaran', () => {
    expect(invoiceStatusFor(1000, 0, 'UNPAID')).toBe('UNPAID')
    expect(invoiceStatusFor(1000, 400, 'UNPAID')).toBe('PARTIAL')
    expect(invoiceStatusFor(1000, 1000, 'PARTIAL')).toBe('PAID')
  })

  it('mempertahankan status DRAFT dan VOID', () => {
    expect(invoiceStatusFor(1000, 1000, 'DRAFT')).toBe('DRAFT')
    expect(invoiceStatusFor(1000, 0, 'VOID')).toBe('VOID')
  })
})

describe('pagination dan rentang tanggal', () => {
  it('menghitung metadata halaman', () => {
    expect(paging({ page: 3, pageSize: 20, search: '' })).toEqual({ skip: 40, take: 20 })
    expect(paginated([1, 2], 42, { page: 2, pageSize: 20, search: '' })).toEqual({
      items: [1, 2], total: 42, page: 2, pageSize: 20, totalPages: 3,
    })
    expect(paginated([], 0, { page: 1, pageSize: 20, search: '' }).totalPages).toBe(1)
  })

  it('membuat rentang inklusif akhir hari', () => {
    const range = dateRange('2026-11-01', '2026-11-02')
    expect(range?.gte?.toISOString()).toBe('2026-10-31T17:00:00.000Z')
    expect(range?.lte?.toISOString()).toBe('2026-11-02T16:59:59.999Z')
    expect(dateRange(undefined, undefined)).toBeUndefined()
  })
})
