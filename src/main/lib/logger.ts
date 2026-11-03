import fs from 'node:fs'
import { files, dirs } from './paths'

function append(level: string, message: string, detail?: unknown): void {
  try {
    fs.mkdirSync(dirs.logs(), { recursive: true })
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
