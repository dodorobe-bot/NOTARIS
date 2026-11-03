import { PermissionError } from './errors'
import type { AuthSession } from './session'

export function can(session: AuthSession | null, permission: string): boolean {
  if (!session) return false
  if (session.roleCode === 'ADMINISTRATOR') return true
  return session.permissions.includes(permission)
}

export function canAny(session: AuthSession | null, permissions: string[]): boolean {
  return permissions.some((p) => can(session, p))
}

export function requirePermission(session: AuthSession | null, permission: string): void {
  if (!can(session, permission)) throw new PermissionError()
}
