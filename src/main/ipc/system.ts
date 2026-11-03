import crypto from 'node:crypto'
import { app } from 'electron'
import { db } from '../db'
import { route } from './router'
import { changePasswordSchema, loginSchema, setupSchema, unlockSchema, changeMasterPasswordSchema } from '../../shared/schemas'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { createSession, clearSession, getSession, sessionInfo, isSessionExpired } from '../lib/session'
import { PermissionError, ConflictError, AppError } from '../lib/errors'
import { audit } from '../lib/audit'
import { saveSettings, getSetting } from '../lib/settings'
import { applyMigrations } from '../lib/migrate'
import { connectDb } from '../db'
import { files, dirs } from '../lib/paths'
import { seedReference } from '../seed'
import { prepareDatabase, maybeDailyBackup } from '../lifecycle'
import {
  vaultStatus, createVault, unlockVault, lockVault, changeMasterPassword,
  regenerateRecoveryCode, getVaultKey, type VaultStatus,
} from '../lib/vault'
import { log } from '../lib/logger'
import { collectObjectSizes, collectPerformance } from '../lib/perf'
import { APP_NAME, APP_VERSION } from '../../shared/constants'

const loginAttempts = new Map<string, { count: number; until: number }>()
const unlockAttempts = new Map<string, { count: number; until: number }>()
const UNLOCK_MAX_ATTEMPTS = 5
const UNLOCK_LOCK_MS = 60_000

async function buildSession(userId: string) {
  const user = await db().user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })
  if (!user || !user.isActive || user.deletedAt) throw new AppError('Akun tidak aktif.', 'FORBIDDEN')
  return createSession({
    token: crypto.randomUUID(),
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    roleId: user.roleId,
    roleCode: user.role.code,
    roleName: user.role.name,
    permissions: user.role.permissions.map((p) => p.permission.code),
  })
}

async function currentTimeout(): Promise<number> {
  try {
    return Number(await getSetting('system.sessionTimeoutMinutes', '30')) || 30
  } catch {
    return 30
  }
}

route('app.info', {
  auth: 'public',
  handler: () => ({
    name: APP_NAME,
    version: APP_VERSION,
    platform: process.platform,
    electron: process.versions.electron,
    dataRoot: dirs.root(),
    timezone: 'Asia/Jakarta',
    isPackaged: app.isPackaged,
  }),
})

route('system.performance', {
  auth: 'session',
  perm: 'settings.manage',
  handler: () => collectPerformance(),
})

route('system.performance.objects', {
  auth: 'session',
  perm: 'settings.manage',
  handler: () => collectObjectSizes(),
})

route('setup.status', {
  auth: 'public',
  handler: async () => {
    const vault = vaultStatus()
    return { needsSetup: await requiresSetup(vault.status), vault }
  },
})

/**
 * Vault DISABLED (NOTARIS_VAULT=off, hanya pengembangan/uji) tidak pernah menghasilkan status SETUP,
 * sehingga penanda instalasi baru harus diambil dari jumlah pengguna. Tanpa ini, instalasi uji tidak
 * bisa diselesaikan sama sekali.
 */
async function requiresSetup(status: VaultStatus): Promise<boolean> {
  if (status === 'SETUP') return true
  if (status !== 'DISABLED') return false
  try {
    return (await db().user.count()) === 0
  } catch {
    return true
  }
}

route('setup.complete', {
  auth: 'public',
  schema: setupSchema,
  handler: async (input) => {
    const status = vaultStatus().status
    if (status !== 'SETUP' && status !== 'DISABLED') throw new ConflictError('Aplikasi sudah dikonfigurasi.')
    applyMigrations(files.db())
    await connectDb()
    await seedReference(db())

    const existing = await db().user.count()
    if (existing > 0) throw new ConflictError('Sudah ada pengguna terdaftar. Setup tidak dapat diulang.')

    const adminRole = await db().role.findUnique({ where: { code: 'ADMINISTRATOR' } })
    if (!adminRole) throw new AppError('Role administrator tidak ditemukan; seed gagal.', 'SEED_ERROR')

    const passwordHash = await hashPassword(input.password)
    const user = await db().user.create({
      data: {
        username: input.username,
        email: input.email || null,
        fullName: input.adminFullName,
        passwordHash,
        roleId: adminRole.id,
      },
    })

    let recoveryCode = ''
    try {
      await saveSettings(
        {
          'office.name': input.officeName,
          'office.notaryName': input.notaryName,
          'security.passwordMinLength': '10',
        },
        user.id,
      )
      if (status === 'DISABLED') {
        log.warn('Vault dinonaktifkan (NOTARIS_VAULT=off): kode pemulihan tidak dibuat. Jangan pakai mode ini untuk data nyata.')
      } else {
        recoveryCode = await createVault(input.masterPassword)
      }
    } catch (err) {
      await db().user.delete({ where: { id: user.id } }).catch(() => undefined)
      throw err
    }

    await audit(db(), {
      userId: user.id,
      username: user.username,
      action: 'SETUP',
      entity: 'System',
      entityId: 'initial',
      after: { officeName: input.officeName, notaryName: input.notaryName, admin: input.username },
    })

    await buildSession(user.id)
    return { session: sessionInfo(), recoveryCode }
  },
})

route('vault.status', { auth: 'public', handler: () => vaultStatus() })

route('vault.unlock', {
  auth: 'public',
  schema: unlockSchema,
  handler: async (input) => {
    const attemptKey = input.useRecovery ? 'recovery' : 'master'
    const now = Date.now()
    const attempt = unlockAttempts.get(attemptKey)
    if (attempt && attempt.until > now) {
      const secs = Math.ceil((attempt.until - now) / 1000)
      throw new AppError(`Terlalu banyak percobaan membuka vault. Coba lagi dalam ${secs} detik.`, 'LOCKED_OUT')
    }
    try {
      await unlockVault(input.password, input.useRecovery)
      unlockAttempts.delete(attemptKey)
    } catch (err) {
      // Hanya kesalahan kunci yang dihitung; database rusak dengan kunci benar tidak boleh
      // membuat pengguna terkunci dari upaya pemulihan berikutnya.
      if (err instanceof Error && err.message.includes('Master password atau recovery code salah')) {
        const count = (attempt?.count ?? 0) + 1
        unlockAttempts.set(attemptKey, {
          count,
          until: count >= UNLOCK_MAX_ATTEMPTS ? now + UNLOCK_LOCK_MS : 0,
        })
        log.warn('Percobaan membuka vault gagal', { attempt: count, mode: attemptKey })
      }
      throw err
    }
    await prepareDatabase()
    return { vault: vaultStatus() }
  },
})

route('vault.lock', {
  auth: 'session',
  handler: async (_p, ctx) => {
    await audit(db(), {
      userId: ctx.session!.userId,
      username: ctx.username,
      action: 'VAULT_LOCK',
      entity: 'System',
      entityId: 'vault',
    })
    clearSession()
    await lockVault()
    return vaultStatus()
  },
})

route('vault.changeMasterPassword', {
  auth: 'session',
  perm: 'settings.manage',
  schema: changeMasterPasswordSchema,
  handler: async (input, ctx) => {
    await changeMasterPassword(input.currentMaster, input.newMaster)
    await audit(db(), {
      userId: ctx.session!.userId,
      username: ctx.username,
      action: 'CHANGE_MASTER_PASSWORD',
      entity: 'System',
      entityId: 'vault',
    })
    return { ok: true }
  },
})

route('vault.regenerateRecovery', {
  auth: 'session',
  perm: 'settings.manage',
  handler: async (_p, ctx) => {
    const recoveryCode = await regenerateRecoveryCode()
    await audit(db(), {
      userId: ctx.session!.userId,
      username: ctx.username,
      action: 'REGENERATE_RECOVERY',
      entity: 'System',
      entityId: 'vault',
    })
    return { recoveryCode }
  },
})

route('auth.login', {
  auth: 'public',
  schema: loginSchema,
  handler: async (input) => {
    const vs = vaultStatus()
    if (vs.status !== 'UNLOCKED' && vs.status !== 'DISABLED') {
      throw new AppError('Database masih terkunci. Buka dengan master password terlebih dahulu.', 'VAULT_LOCKED')
    }
    const now = Date.now()
    const attempt = loginAttempts.get(input.username.toLowerCase())
    if (attempt && attempt.until > now) {
      const secs = Math.ceil((attempt.until - now) / 1000)
      throw new AppError(`Terlalu banyak percobaan gagal. Coba lagi dalam ${secs} detik.`, 'LOCKED_OUT')
    }

    const user = await db().user.findFirst({
      where: { username: input.username, deletedAt: null },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    })

    const valid = user ? await verifyPassword(input.password, user.passwordHash) : false
    if (!user || !valid) {
      const count = (attempt?.count ?? 0) + 1
      const maxAttempts = Number(await getSetting('security.maxLoginAttempts', '5')) || 5
      loginAttempts.set(input.username.toLowerCase(), {
        count,
        until: count >= maxAttempts ? now + 60_000 : 0,
      })
      await audit(db(), {
        userId: user?.id ?? null,
        username: input.username,
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user?.id ?? null,
      })
      throw new AppError('Username atau password salah.', 'INVALID_CREDENTIALS')
    }
    if (!user.isActive) throw new AppError('Akun dinonaktifkan. Hubungi administrator.', 'INACTIVE')

    loginAttempts.delete(input.username.toLowerCase())
    await db().user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await buildSession(user.id)
    await audit(db(), {
      userId: user.id,
      username: user.username,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
    })
    void maybeDailyBackup(getVaultKey())
    return { session: sessionInfo(), user: { mustChangePassword: user.mustChangePassword } }
  },
})

route('auth.logout', {
  auth: 'session',
  handler: async (_p, ctx) => {
    await audit(db(), {
      userId: ctx.session!.userId,
      username: ctx.username,
      action: 'LOGOUT',
      entity: 'User',
      entityId: ctx.session!.userId,
    })
    clearSession()
    return { ok: true }
  },
})

route('auth.session', {
  auth: 'public',
  handler: async () => {
    const session = getSession()
    if (!session) return { session: null, vault: vaultStatus() }
    if (isSessionExpired(await currentTimeout())) {
      clearSession()
      return { session: null, vault: vaultStatus(), expired: true }
    }
    return { session: sessionInfo(), vault: vaultStatus() }
  },
})

route('auth.touch', {
  auth: 'public',
  handler: async () => {
    const session = getSession()
    if (!session) return { valid: false }
    if (isSessionExpired(await currentTimeout())) {
      clearSession()
      return { valid: false }
    }
    const { touchSession } = await import('../lib/session')
    touchSession()
    return { valid: true }
  },
})

route('auth.changePassword', {
  auth: 'session',
  schema: changePasswordSchema,
  handler: async (input, ctx) => {
    const user = await db().user.findUnique({ where: { id: ctx.session!.userId } })
    if (!user) throw new AppError('Pengguna tidak ditemukan.')
    const ok = await verifyPassword(input.currentPassword, user.passwordHash)
    if (!ok) throw new AppError('Password saat ini salah.', 'INVALID_CREDENTIALS')
    const minLength = Number(await getSetting('security.passwordMinLength', '10')) || 10
    if (input.newPassword.length < minLength) {
      throw new AppError(`Password baru minimal ${minLength} karakter.`, 'VALIDATION')
    }
    if (await verifyPassword(input.newPassword, user.passwordHash)) {
      throw new AppError('Password baru tidak boleh sama dengan password lama.', 'VALIDATION')
    }
    await db().user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
    })
    await audit(db(), {
      userId: user.id,
      username: user.username,
      action: 'CHANGE_PASSWORD',
      entity: 'User',
      entityId: user.id,
    })
    return { ok: true }
  },
})

route('auth.roles', {
  auth: 'session',
  handler: async () => {
    const roles = await db().role.findMany({ orderBy: { name: 'asc' } })
    return roles.map((r) => ({ id: r.id, code: r.code, name: r.name }))
  },
})

route('app.accounts', {
  auth: 'session',
  handler: async () => {
    if (!getSession()) throw new PermissionError()
    const users = await db().user.findMany({
      where: { deletedAt: null },
      select: { id: true, fullName: true, username: true, role: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    })
    return users.map((u) => ({ id: u.id, fullName: u.fullName, username: u.username, roleName: u.role.name }))
  },
})
