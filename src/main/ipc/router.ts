import { ipcMain } from 'electron'
import { performance } from 'node:perf_hooks'
import { ZodError, type ZodTypeAny } from 'zod'
import { getSession, clearSession, isSessionExpired, sessionInfo, touchSession, type AuthSession } from '../lib/session'
import { can } from '../lib/rbac'
import { AppError, PermissionError, toErrorMessage } from '../lib/errors'
import { log } from '../lib/logger'
import { getSetting } from '../lib/settings'
import { maintenanceReason } from '../lib/maintenance'
import { recordRequest } from '../lib/perf-log'

export interface Ctx {
  session: AuthSession | null
  username: string
}

export interface RouteDef {
  auth?: 'public' | 'session'
  perm?: string
  /** `false` untuk rute yang dipanggil berkala (polling) agar tidak memperpanjang sesi diam. */
  touch?: boolean
  schema?: ZodTypeAny
  // Payload divalidasi runtime oleh `schema`; tipe internal sengaja longgar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (payload: any, ctx: Ctx) => Promise<unknown> | unknown
}

export type ApiResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string }

const registry = new Map<string, RouteDef>()

let lastActivityAt = Date.now()

export function noteActivity(): void {
  lastActivityAt = Date.now()
}

export function msSinceLastActivity(): number {
  return Date.now() - lastActivityAt
}

export function route(name: string, def: RouteDef): void {
  if (registry.has(name)) throw new Error(`Rute ganda: ${name}`)
  registry.set(name, def)
}

let timeoutCache: { value: number; at: number } | null = null

async function sessionTimeoutMinutes(): Promise<number> {
  if (timeoutCache && Date.now() - timeoutCache.at < 10_000) return timeoutCache.value
  let value = 30
  try {
    value = Number(await getSetting('system.sessionTimeoutMinutes', '30')) || 30
  } catch {
    /* default */
  }
  timeoutCache = { value, at: Date.now() }
  return value
}

export function registerIpc(): void {
  ipcMain.handle('app:call', async (_event, req: { route?: string; payload?: unknown }): Promise<ApiResponse> => {
    noteActivity()
    const key = typeof req?.route === 'string' ? req.route : ''
    const def = registry.get(key)
    if (!def) return { ok: false, error: 'Rute API tidak dikenal.', code: 'NO_ROUTE' }
    const startedAt = performance.now()
    const elapsed = () => performance.now() - startedAt
    try {
      const busy = maintenanceReason()
      if (def.auth !== 'public' && busy) {
        recordRequest(key, elapsed(), false, 'BUSY')
        return { ok: false, error: `Aplikasi sedang sibuk (${busy}). Coba lagi setelah selesai.`, code: 'BUSY' }
      }
      let session = getSession()
      if (def.auth !== 'public') {
        if (!session) throw new AppError('Sesi tidak aktif. Silakan masuk kembali.', 'SESSION_EXPIRED')
        const timeout = await sessionTimeoutMinutes()
        if (isSessionExpired(timeout)) {
          clearSession()
          throw new AppError('Sesi berakhir karena tidak ada aktivitas. Silakan masuk kembali.', 'SESSION_EXPIRED')
        }
        if (def.touch !== false) touchSession()
        session = getSession()
        if (def.perm && !can(session, def.perm)) throw new PermissionError()
      }
      let payload: unknown = req.payload ?? {}
      if (def.schema) payload = def.schema.parse(payload)
      const data = await def.handler(payload, { session, username: session?.username ?? '-' })
      recordRequest(key, elapsed(), true)
      return { ok: true, data }
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0]
        const path = first?.path?.join('.') ?? ''
        recordRequest(key, elapsed(), false, 'VALIDATION')
        return {
          ok: false,
          error: first ? `${path ? path + ': ' : ''}${first.message}` : 'Data tidak valid.',
          code: 'VALIDATION',
        }
      }
      if (err instanceof PermissionError || err instanceof AppError) {
        recordRequest(key, elapsed(), false, err.code)
        return { ok: false, error: err.message, code: err.code }
      }
      log.error(`API error pada ${key}`, {
        message: (err as Error)?.message,
        stack: (err as Error)?.stack?.split('\n').slice(0, 4).join(' | '),
      })
      recordRequest(key, elapsed(), false, 'ERROR')
      return { ok: false, error: toErrorMessage(err), code: 'ERROR' }
    }
  })
}

/** Untuk keperluan pengujian unit router. */
export function getRegisteredRoutes(): string[] {
  return [...registry.keys()].sort()
}

export { sessionInfo }
