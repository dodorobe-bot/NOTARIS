/// <reference types="vite/client" />

export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  code?: string
}

declare global {
  interface Window {
    notaris: {
      call<T = unknown>(route: string, payload?: unknown): Promise<ApiResponse<T>>
      platform: string
      versions: { electron: string; chrome: string; node: string }
    }
  }
}

export {}
