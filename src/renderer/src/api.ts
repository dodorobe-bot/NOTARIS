import { useCallback, useEffect, useRef, useState } from 'react'

export class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export async function call<T = any>(route: string, payload: unknown = {}): Promise<T> {
  const res = await window.notaris.call<T>(route, payload)
  if (!res.ok) {
    if (res.code === 'SESSION_EXPIRED') window.dispatchEvent(new Event('notaris:session-expired'))
    throw new ApiError(res.error ?? 'Terjadi kesalahan.', res.code)
  }
  return res.data as T
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function useQuery<T = any>(
  route: string,
  payload: Record<string, unknown> = {},
  options: { enabled?: boolean; pollMs?: number } = {},
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(options.enabled !== false)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(payload ?? {})
  const enabled = options.enabled !== false
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (silent = false) => {
      if (!enabled) return
      if (!silent) setLoading(true)
      try {
        const result = await call<T>(route, JSON.parse(key))
        if (mounted.current) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (mounted.current) setError((err as Error).message)
      } finally {
        if (mounted.current) setLoading(false)
      }
    },
    [route, key, enabled],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!options.pollMs || !enabled) return
    const timer = window.setInterval(() => void load(true), options.pollMs)
    return () => window.clearInterval(timer)
  }, [load, options.pollMs, enabled])

  return { data, loading, error, reload: load, setData }
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}
