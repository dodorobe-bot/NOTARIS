export interface AuthSession {
  token: string
  userId: string
  username: string
  fullName: string
  email: string | null
  roleId: string
  roleCode: string
  roleName: string
  permissions: string[]
  loginAt: number
  lastActivity: number
}

let current: AuthSession | null = null

export function createSession(data: Omit<AuthSession, 'loginAt' | 'lastActivity'>): AuthSession {
  const now = Date.now()
  current = { ...data, loginAt: now, lastActivity: now }
  return current
}

export function getSession(): AuthSession | null {
  return current
}

export function clearSession(): void {
  current = null
}

export function touchSession(): void {
  if (current) current.lastActivity = Date.now()
}

export function isSessionExpired(timeoutMinutes: number, now = Date.now()): boolean {
  if (!current) return true
  const limit = Math.max(1, timeoutMinutes) * 60_000
  return now - current.lastActivity > limit
}

export function sessionInfo() {
  if (!current) return null
  return {
    userId: current.userId,
    username: current.username,
    fullName: current.fullName,
    email: current.email,
    roleCode: current.roleCode,
    roleName: current.roleName,
    permissions: current.permissions,
    loginAt: new Date(current.loginAt).toISOString(),
    lastActivity: new Date(current.lastActivity).toISOString(),
  }
}

export type SessionInfo = NonNullable<ReturnType<typeof sessionInfo>>
