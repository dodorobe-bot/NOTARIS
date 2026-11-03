import { contextBridge, ipcRenderer } from 'electron'

export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  code?: string
}

const api = {
  call<T = unknown>(route: string, payload: unknown = {}): Promise<ApiResponse<T>> {
    return ipcRenderer.invoke('app:call', { route, payload }) as Promise<ApiResponse<T>>
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
}

contextBridge.exposeInMainWorld('notaris', api)

export type NotarisApi = typeof api
