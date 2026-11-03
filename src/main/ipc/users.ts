import { z } from 'zod'
import { db, inTransaction } from '../db'
import { route } from './router'
import {
  idSchema, paginationSchema, rolePermissionsSchema, userCreateSchema, userUpdateSchema,
} from '../../shared/schemas'
import { audit } from '../lib/audit'
import { hashPassword } from '../lib/crypto'
import { paging, paginated } from '../lib/util'
import { ConflictError, NotFoundError, PermissionError } from '../lib/errors'
import { PERMISSION_CATALOG } from '../../shared/constants'

route('users.list', {
  auth: 'session',
  perm: 'users.view',
  schema: paginationSchema.extend({ roleId: z.string().optional(), active: z.boolean().optional() }),
  handler: async (q) => {
    const where: Record<string, unknown> = { deletedAt: null }
    if (q.roleId) where.roleId = q.roleId
    if (typeof q.active === 'boolean') where.isActive = q.active
    if (q.search) {
      where.OR = [
        { fullName: { contains: q.search } },
        { username: { contains: q.search } },
        { email: { contains: q.search } },
      ]
    }
    const [total, items] = await Promise.all([
      db().user.count({ where }),
      db().user.findMany({
        where, ...paging(q), orderBy: { fullName: 'asc' },
        select: {
          id: true, username: true, fullName: true, email: true, isActive: true,
          lastLoginAt: true, createdAt: true,
          role: { select: { id: true, code: true, name: true } },
        },
      }),
    ])
    return paginated(items, total, q)
  },
})

route('users.create', {
  auth: 'session',
  perm: 'users.manage',
  schema: userCreateSchema,
  handler: async (input, ctx) => {
    const exists = await db().user.findFirst({ where: { username: input.username } })
    if (exists) throw new ConflictError('Username sudah digunakan.')
    const role = await db().role.findUnique({ where: { id: input.roleId } })
    if (!role) throw new NotFoundError('Role tidak ditemukan.')
    return inTransaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          email: input.email,
          roleId: input.roleId,
          passwordHash: await hashPassword(input.password),
          isActive: input.isActive,
          mustChangePassword: true,
        },
        select: { id: true, username: true, fullName: true, role: { select: { name: true } } },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'CREATE', entity: 'User', entityId: created.id,
        after: { username: created.username, fullName: created.fullName, role: created.role.name },
      })
      return created
    })
  },
})

route('users.update', {
  auth: 'session',
  perm: 'users.manage',
  schema: userUpdateSchema,
  handler: async (input, ctx) => {
    const existing = await db().user.findFirst({ where: { id: input.id, deletedAt: null }, include: { role: true } })
    if (!existing) throw new NotFoundError('Pengguna tidak ditemukan.')
    if (existing.id === ctx.session!.userId && !input.isActive) {
      throw new ConflictError('Anda tidak dapat menonaktifkan akun sendiri.')
    }
    if (existing.role.code === 'ADMINISTRATOR' && existing.isActive && (!input.isActive || input.roleId !== existing.roleId)) {
      const activeAdmins = await db().user.count({ where: { role: { code: 'ADMINISTRATOR' }, isActive: true, deletedAt: null } })
      if (activeAdmins <= 1) throw new ConflictError('Minimal harus ada satu administrator aktif.')
    }
    return inTransaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: input.id },
        data: {
          fullName: input.fullName,
          email: input.email,
          roleId: input.roleId,
          isActive: input.isActive,
          ...(input.password ? { passwordHash: await hashPassword(input.password), mustChangePassword: true } : {}),
        },
        select: { id: true, username: true, fullName: true, isActive: true, role: { select: { name: true } } },
      })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE', entity: 'User', entityId: input.id,
        before: { role: existing.role.name, isActive: existing.isActive },
        after: { role: updated.role.name, isActive: updated.isActive, passwordChanged: !!input.password },
      })
      return updated
    })
  },
})

route('users.deactivate', {
  auth: 'session',
  perm: 'users.manage',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    if (id === ctx.session!.userId) throw new PermissionError('Anda tidak dapat menonaktifkan akun sendiri.')
    const user = await db().user.findFirst({ where: { id, deletedAt: null }, include: { role: true } })
    if (!user) throw new NotFoundError('Pengguna tidak ditemukan.')
    if (user.role.code === 'ADMINISTRATOR') {
      const activeAdmins = await db().user.count({ where: { role: { code: 'ADMINISTRATOR' }, isActive: true, deletedAt: null } })
      if (activeAdmins <= 1) throw new ConflictError('Minimal harus ada satu administrator aktif.')
    }
    await inTransaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'DEACTIVATE', entity: 'User', entityId: id,
        before: { username: user.username, isActive: user.isActive },
      })
    })
    return { ok: true }
  },
})

route('roles.list', {
  auth: 'session',
  perm: 'users.view',
  handler: async () => {
    return db().role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    })
  },
})

route('roles.permissions', {
  auth: 'session',
  perm: 'users.manage',
  schema: rolePermissionsSchema,
  handler: async (input, ctx) => {
    const role = await db().role.findUnique({ where: { id: input.roleId } })
    if (!role) throw new NotFoundError('Role tidak ditemukan.')
    if (role.code === 'ADMINISTRATOR') throw new ConflictError('Hak akses Administrator tidak dapat diubah.')
    const valid = new Set(PERMISSION_CATALOG.map((p) => p.code))
    const codes = input.permissionCodes.filter((c: string) => valid.has(c))
    return inTransaction(async (tx) => {
      const perms = await tx.permission.findMany({ where: { code: { in: codes } }, select: { id: true } })
      const before = await tx.rolePermission.findMany({ where: { roleId: role.id }, include: { permission: { select: { code: true } } } })
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } })
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) })
      await audit(tx, {
        userId: ctx.session!.userId, username: ctx.username, action: 'UPDATE_PERMISSIONS', entity: 'Role', entityId: role.id,
        before: { permissions: before.map((b) => b.permission.code) },
        after: { permissions: codes },
      })
      return { ok: true, count: perms.length }
    })
  },
})

route('permissions.catalog', {
  auth: 'session',
  handler: async () => PERMISSION_CATALOG,
})
