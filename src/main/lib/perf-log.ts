import fs from 'node:fs'
import path from 'node:path'
import { dirs } from './paths'
import { appendSample, isSlowRequest, perfLogEntry, type PerfSample } from '../../shared/perf'

/** Batas berkas log agar tidak tumbuh tanpa kendali; berkas lama disimpan sebagai .1 */
const MAX_LOG_BYTES = 2 * 1024 * 1024

let ring: PerfSample[] = []

export function perfLogFile(): string {
  return path.join(dirs.logs(), 'performance.log')
}

/**
 * Mencatat satu permintaan API. Hanya nama rute, durasi, status, dan kode hasil yang
 * disimpan — payload tidak pernah ikut, sehingga NIK/isi akta/password tidak bocor ke log.
 * Permintaan cepat hanya masuk ring memori; permintaan lambat ditulis ke berkas.
 */
export function recordRequest(route: string, ms: number, ok: boolean, code?: string): void {
  const sample: PerfSample = { route, ms, ok, code, at: Date.now() }
  ring = appendSample(ring, sample)
  if (!isSlowRequest(ms)) return
  try {
    const file = perfLogFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    try {
      if (fs.statSync(file).size >= MAX_LOG_BYTES) fs.renameSync(file, `${file}.1`)
    } catch {
      /* berkas belum ada */
    }
    fs.appendFileSync(file, perfLogEntry(sample) + '\n', { mode: 0o600 })
  } catch {
    /* pencatatan performa tidak boleh menggagalkan permintaan */
  }
}

export function recentSamples(): PerfSample[] {
  return ring.slice()
}

export function perfLogSize(): number {
  try {
    return fs.statSync(perfLogFile()).size
  } catch {
    return 0
  }
}
