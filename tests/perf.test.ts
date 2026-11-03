import { describe, expect, it } from 'vitest'
import {
  appendSample,
  perfByRoute,
  perfLogEntry,
  perfSummary,
  safeRouteName,
  type PerfSample,
} from '../src/shared/perf'

function sample(route: string, ms: number, ok = true, code?: string): PerfSample {
  return { route, ms, ok, code, at: 1_700_000_000_000 }
}

describe('log performa tanpa data pribadi', () => {
  it('hanya menulis kunci rute, durasi, status, kode, dan waktu', () => {
    const entry = JSON.parse(perfLogEntry({
      ...sample('clients.list', 12.34),
      // Field tambahan tidak boleh lolos meski pemanggil keliru menyertakannya.
      ...({ payload: { nik: '3201010101010001' }, username: 'notaris', note: 'isi akta' } as object),
    }))
    expect(Object.keys(entry).sort()).toEqual(['at', 'ms', 'ok', 'route'])
    expect(JSON.stringify(entry)).not.toContain('3201')
    expect(JSON.stringify(entry)).not.toContain('notaris')
  })

  it('menyamarkan nama rute asing dan kode galat bebas', () => {
    expect(safeRouteName('deeds.create')).toBe('deeds.create')
    expect(safeRouteName('../../etc/passwd')).toBe('unknown')
    expect(safeRouteName('route dengan spasi')).toBe('unknown')
    const entry = JSON.parse(perfLogEntry(sample('bad route!', 5, false, 'nik-3201')))
    expect(entry.route).toBe('unknown')
    expect(entry.code).toBeUndefined()
    expect(entry.ok).toBe(false)
  })

  it('membulatkan durasi dan menolak nilai negatif atau tidak terbatas', () => {
    expect(JSON.parse(perfLogEntry(sample('clients.list', -5))).ms).toBe(0)
    expect(JSON.parse(perfLogEntry(sample('clients.list', Number.NaN))).ms).toBe(0)
    expect(JSON.parse(perfLogEntry(sample('clients.list', 12.34))).ms).toBe(12.3)
  })
})

describe('ringkasan latensi', () => {
  it('menghitung p50/p95/maks dengan nearest-rank', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const summary = perfSummary(values.map((ms) => sample('r', ms)))
    expect(summary.count).toBe(10)
    expect(summary.p50).toBe(5)
    expect(summary.p95).toBe(10)
    expect(summary.max).toBe(10)
    expect(summary.slow).toBe(0)
  })

  it('menandai permintaan lambat dan mengabaikan nilai tidak valid', () => {
    const summary = perfSummary([sample('a', 10), sample('a', 300), sample('a', Number.NaN), sample('a', -1)])
    expect(summary.count).toBe(2)
    expect(summary.slow).toBe(1)
    expect(summary.max).toBe(300)
  })

  it('mengembalikan nol untuk sesi tanpa panggilan', () => {
    expect(perfSummary([])).toEqual({ count: 0, p50: 0, p95: 0, max: 0, slow: 0 })
  })

  it('mengelompokkan per rute menurut p95', () => {
    const samples = [
      sample('slow.route', 400), sample('slow.route', 380),
      sample('fast.route', 5), sample('fast.route', 9),
      sample('medium.route', 120),
    ]
    const rows = perfByRoute(samples, 3)
    expect(rows.map((r) => r.route)).toEqual(['slow.route', 'medium.route', 'fast.route'])
    expect(rows[0].count).toBe(2)
    expect(rows[0].p95).toBe(400)
  })

  it('membatasi ring memori pada ukuran maksimum', () => {
    let ring: PerfSample[] = []
    for (let i = 0; i < 10; i++) ring = appendSample(ring, sample('r', i), 5)
    expect(ring).toHaveLength(5)
    expect(ring.map((s) => s.ms)).toEqual([5, 6, 7, 8, 9])
  })
})
