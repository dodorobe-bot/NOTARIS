import fs from 'node:fs'
import { files, dirs } from './paths'

const MAX_LOG_BYTES = 10 * 1024 * 1024
const ROTATE_CHECK_MS = 60_000
let lastRotateCheck = 0

/**
 * app.log dibatasi 10 MB dengan satu berkas arsip. Tanpa batas, log tumbuh terus selama aplikasi
 * dipakai bertahun-tahun dan dapat memenuhi disk workstation.
 */
function rotateIfNeeded(): void {
  const now = Date.now()
  if (now - lastRotateCheck < ROTATE_CHECK_MS) return
  lastRotateCheck = now
  try {
    const path = files.appLog()
    if (!fs.existsSync(path) || fs.statSync(path).size < MAX_LOG_BYTES) return
    const archived = `${path}.1`
    fs.rmSync(archived, { force: true })
    fs.renameSync(path, archived)
  } catch {
    /* rotasi gagal tidak boleh menghentikan aplikasi */
  }
}

function append(level: string, message: string, detail?: unknown): void {
  try {
    fs.mkdirSync(dirs.logs(), { recursive: true })
    rotateIfNeeded()
    const extra = detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
    const line = `[${new Date().toISOString()}] [${level}] ${message}${extra}\n`
    fs.appendFileSync(files.appLog(), line)
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(line.trim())
    }
  } catch {
    /* logging tidak boleh menghentikan aplikasi */
  }
}

export const log = {
  info: (msg: string, detail?: unknown) => append('INFO', msg, detail),
  warn: (msg: string, detail?: unknown) => append('WARN', msg, detail),
  error: (msg: string, detail?: unknown) => append('ERROR', msg, detail),
}
