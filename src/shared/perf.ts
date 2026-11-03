/**
 * Ringkasan dan penulisan log performa.
 *
 * Log hanya boleh memuat nama rute terdaftar, durasi, status, dan waktu. Tidak ada
 * payload, NIK, isi akta, nama pengguna, atau pesan galat bebas yang dapat memuat
 * data pribadi. Modul ini murni agar dapat diuji tanpa Electron.
 */
export const SLOW_REQUEST_MS = 250
export const PERF_RING_SIZE = 500

export interface PerfSample {
  route: string
  ms: number
  ok: boolean
  code?: string
  at: number
}

export interface PerfSummary {
  count: number
  p50: number
  p95: number
  max: number
  slow: number
}

const ROUTE_PATTERN = /^[a-z][a-zA-Z0-9._-]{0,64}$/
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,31}$/

export function safeRouteName(route: string): string {
  return ROUTE_PATTERN.test(route) ? route : 'unknown'
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function isSlowRequest(ms: number): boolean {
  return Number.isFinite(ms) && ms >= SLOW_REQUEST_MS
}

/** Persentil dengan metode nearest-rank pada data yang sudah diurutkan menaik. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

export function perfSummary(samples: PerfSample[]): PerfSummary {
  const values = samples.map((s) => s.ms).filter((ms) => Number.isFinite(ms) && ms >= 0).sort((a, b) => a - b)
  if (values.length === 0) return { count: 0, p50: 0, p95: 0, max: 0, slow: 0 }
  return {
    count: values.length,
    p50: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    max: round(values[values.length - 1]),
    slow: samples.filter((s) => isSlowRequest(s.ms)).length,
  }
}

/** Baris JSONL untuk log; hanya kunci di bawah ini yang pernah ditulis. */
export function perfLogEntry(sample: PerfSample): string {
  return JSON.stringify({
    at: new Date(sample.at).toISOString(),
    route: safeRouteName(sample.route),
    ms: Number.isFinite(sample.ms) ? round(Math.max(0, sample.ms)) : 0,
    ok: sample.ok === true,
    code: sample.code && CODE_PATTERN.test(sample.code) ? sample.code : undefined,
  })
}

export function appendSample(ring: PerfSample[], sample: PerfSample, max = PERF_RING_SIZE): PerfSample[] {
  const next = ring.length >= max ? ring.slice(ring.length - max + 1) : ring.slice()
  next.push(sample)
  return next
}

export interface RoutePerf extends PerfSummary {
  route: string
}

/** Ringkasan per rute, diurutkan menurut p95 lalu jumlah permintaan. */
export function perfByRoute(samples: PerfSample[], limit = 8): RoutePerf[] {
  const groups = new Map<string, PerfSample[]>()
  for (const sample of samples) {
    const key = safeRouteName(sample.route)
    const list = groups.get(key)
    if (list) list.push(sample)
    else groups.set(key, [sample])
  }
  return [...groups.entries()]
    .map(([route, list]) => ({ route, ...perfSummary(list) }))
    .sort((a, b) => b.p95 - a.p95 || b.count - a.count)
    .slice(0, Math.max(0, limit))
}
