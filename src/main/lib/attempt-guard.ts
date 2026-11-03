import fs from 'node:fs'
import path from 'node:path'

export interface GuardStatus {
  locked: boolean
  retryAfterMs: number
  count: number
}

interface Entry {
  count: number
  until: number
}

type State = Record<string, Entry>

const MAX_KEY_LENGTH = 200
const MAX_FILE_BYTES = 64 * 1024
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_LOCK_MS = 60_000

function sanitize(raw: unknown): State {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: State = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) continue
    if (!value || typeof value !== 'object') continue
    const count = Number((value as Entry).count)
    const until = Number((value as Entry).until)
    if (!Number.isFinite(count) || !Number.isFinite(until)) continue
    out[key] = {
      count: Math.min(1_000_000, Math.max(0, Math.floor(count))),
      until: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(until))),
    }
  }
  return out
}

/**
 * Penghitung percobaan gagal yang bertahan setelah aplikasi ditutup. Status hanya berisi
 * jumlah dan waktu; tidak pernah memuat sandi. Bila berkas tidak dapat ditulis, pembatasan
 * tetap berlaku di memori proses yang sedang berjalan.
 */
export class AttemptGuard {
  private readonly filePath: string
  private readonly maxAttempts: number
  private readonly lockMs: number
  private readonly clock: () => number
  private state: State

  constructor(
    filePath: string,
    options: { maxAttempts?: number; lockMs?: number; now?: () => number } = {},
  ) {
    this.filePath = filePath
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS))
    this.lockMs = Math.max(1_000, Math.floor(options.lockMs ?? DEFAULT_LOCK_MS))
    this.clock = options.now ?? Date.now
    this.state = this.load()
  }

  status(key: string): GuardStatus {
    const entry = this.state[key]
    if (!entry) return { locked: false, retryAfterMs: 0, count: 0 }
    const now = this.clock()
    if (entry.until > now) {
      // Jam mundur atau berkas yang menyimpan waktu terlalu jauh tidak boleh mengunci permanen.
      const until = Math.min(entry.until, now + this.lockMs)
      entry.until = until
      return { locked: true, retryAfterMs: Math.max(0, until - now), count: entry.count }
    }
    return { locked: false, retryAfterMs: 0, count: entry.count }
  }

  registerFailure(key: string, maxAttempts = this.maxAttempts): GuardStatus {
    const entry = this.state[key] ?? { count: 0, until: 0 }
    const now = this.clock()
    const count = entry.count + 1
    const until = count >= Math.max(1, Math.floor(maxAttempts)) ? now + this.lockMs : 0
    this.state[key] = { count, until }
    this.persist()
    return { locked: until > now, retryAfterMs: until > now ? until - now : 0, count }
  }

  clear(key: string): void {
    if (!(key in this.state)) return
    delete this.state[key]
    this.persist()
  }

  private load(): State {
    try {
      const stat = fs.statSync(this.filePath)
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return {}
      return sanitize(JSON.parse(fs.readFileSync(this.filePath, 'utf8')))
    } catch {
      return {}
    }
  }

  private persist(): void {
    const tmp = `${this.filePath}.tmp`
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 })
      fs.renameSync(tmp, this.filePath)
    } catch {
      try { fs.rmSync(tmp, { force: true }) } catch { /* diabaikan */ }
    }
  }
}
