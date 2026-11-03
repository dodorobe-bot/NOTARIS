import { z } from 'zod'
import { db } from '../db'
import { route } from './router'
import { monthStart, startOfToday, endOfToday } from '../lib/util'
import { refreshOverdueDeadlines } from '../lib/automation'
import { startOfZonedMonthOffset, zonedMonthKey } from '../lib/time'
import { APP_TIMEZONE } from '../../shared/format'
import { WORKFLOW_LABELS } from '../../shared/constants'

function growth(current: number, previous: number): { current: number; previous: number; percent: number | null } {
  if (previous === 0) return { current, previous, percent: null }
  return { current, previous, percent: Math.round(((current - previous) / previous) * 100) }
}

const dashboardSchema = z.object({
  months: z.number().int().min(3).max(12).optional(),
})

route('dashboard.get', {
  auth: 'session',
  perm: 'dashboard.view',
  schema: dashboardSchema,
  handler: async (input, ctx) => {
    await refreshOverdueDeadlines({ userId: ctx.session!.userId, username: ctx.username })
    const now = new Date()
    const rangeMonths = input.months ?? 6
    const from = startOfZonedMonthOffset(now, -(rangeMonths - 1))
    const monthBegin = monthStart(now)
    const nextMonthBegin = startOfZonedMonthOffset(now, 1)
    const prevMonthBegin = startOfZonedMonthOffset(now, -1)
    const completedStatuses = ['SIGNED', 'REGISTERED', 'ARCHIVED']
    const [
      totalClients, totalDeeds, deedsInProcess, deedsCompleted, deedsUnsigned,
      clientsThisMonth, clientsPrevMonth, deedsThisMonth, deedsPrevMonth,
      completedThisMonth, completedPrevMonth,
      totalTransactions, activeTransactions, incomeMonth, outstandingAgg,
      todayAppointments, incomplete, notifications, tasks, deadlines, recentTransactions,
      payments, deedTypeGroups, deedTypes,
    ] = await Promise.all([
      db().client.count({ where: { deletedAt: null, status: 'AKTIF' } }),
      db().deed.count(),
      db().deed.count({ where: { status: { in: ['DRAFT', 'REVIEW', 'APPROVED'] } } }),
      db().deed.count({ where: { status: { in: completedStatuses } } }),
      db().deed.count({ where: { status: 'APPROVED' } }),
      db().client.count({ where: { deletedAt: null, createdAt: { gte: monthBegin } } }),
      db().client.count({ where: { deletedAt: null, createdAt: { gte: prevMonthBegin, lt: monthBegin } } }),
      db().deed.count({ where: { createdAt: { gte: monthBegin } } }),
      db().deed.count({ where: { createdAt: { gte: prevMonthBegin, lt: monthBegin } } }),
      db().deed.count({ where: { status: { in: completedStatuses }, signedAt: { gte: monthBegin, lt: nextMonthBegin } } }),
      db().deed.count({ where: { status: { in: completedStatuses }, signedAt: { gte: prevMonthBegin, lt: monthBegin } } }),
      db().transaction.count({ where: { deletedAt: null } }),
      db().transaction.count({ where: { deletedAt: null, status: { notIn: ['SELESAI', 'BATAL'] } } }),
      db().payment.aggregate({ where: { paidAt: { gte: monthBegin, lt: nextMonthBegin } }, _sum: { amount: true } }),
      db().invoice.aggregate({
        where: { status: { in: ['UNPAID', 'PARTIAL'] } },
        _sum: { total: true, paidAmount: true },
      }),
      db().appointment.findMany({
        where: { startAt: { gte: startOfToday(), lte: endOfToday() } },
        orderBy: { startAt: 'asc' },
        include: { client: { select: { fullName: true } }, transaction: { select: { code: true } } },
      }),
      db().transaction.findMany({
        where: { deletedAt: null, status: { in: ['REGISTRASI_TRANSAKSI', 'UPLOAD_DOKUMEN', 'VERIFIKASI'] } },
        orderBy: { createdAt: 'asc' },
        take: 6,
        include: { client: { select: { fullName: true } }, _count: { select: { documents: true } } },
      }),
      db().notification.findMany({
        where: { isRead: false, OR: [{ userId: null }, { userId: ctx.session!.userId }] },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      db().workTask.findMany({
        where: { assignedToId: ctx.session!.userId, status: { in: ['TODO', 'IN_PROGRESS'] } },
        orderBy: { dueDate: 'asc' },
        take: 6,
      }),
      db().legalDeadline.findMany({
        where: { status: 'AKTIF' },
        orderBy: { dueDate: 'asc' },
        take: 6,
        include: { transaction: { select: { code: true, title: true } } },
      }),
      db().transaction.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          client: { select: { fullName: true } },
          assignedTo: { select: { fullName: true } },
          deeds: { take: 1, select: { deedType: { select: { name: true } } } },
        },
      }),
      db().payment.findMany({
        where: { paidAt: { gte: from } },
        select: { paidAt: true, amount: true },
      }),
      db().deed.groupBy({ by: ['deedTypeId'], _count: { _all: true } }),
      db().deedType.findMany({ select: { id: true, name: true, category: true } }),
    ])

    const months: { key: string; label: string; income: number }[] = []
    for (let i = rangeMonths - 1; i >= 0; i--) {
      const d = startOfZonedMonthOffset(now, -i)
      months.push({
        key: zonedMonthKey(d),
        label: new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: APP_TIMEZONE }).format(d),
        income: 0,
      })
    }
    for (const p of payments) {
      const m = months.find((x) => x.key === zonedMonthKey(p.paidAt))
      if (m) m.income += p.amount
    }
    const typeName = new Map(deedTypes.map((t) => [t.id, t.name]))
    const deedTypeDistribution = deedTypeGroups
      .map((g) => ({ name: typeName.get(g.deedTypeId) ?? 'Lainnya', value: g._count._all }))
      .sort((a, b) => b.value - a.value)
    const totalIncome = months.reduce((sum, m) => sum + m.income, 0)

    return {
      stats: {
        totalClients,
        totalDeeds,
        deedsInProcess,
        deedsCompleted,
        deedsUnsigned,
        totalTransactions,
        activeTransactions,
        incomeMonth: incomeMonth._sum.amount ?? 0,
        receivables: (outstandingAgg._sum.total ?? 0) - (outstandingAgg._sum.paidAmount ?? 0),
        unreadNotifications: notifications.filter((n) => !n.isRead).length,
        incompleteDocuments: incomplete.length,
        trends: {
          clients: growth(clientsThisMonth, clientsPrevMonth),
          deeds: growth(deedsThisMonth, deedsPrevMonth),
          completed: growth(completedThisMonth, completedPrevMonth),
        },
      },
      todayAppointments,
      incompleteDocuments: incomplete.map((t) => ({
        id: t.id, code: t.code, title: t.title, client: t.client.fullName,
        status: t.status, statusLabel: WORKFLOW_LABELS[t.status] ?? t.status,
        documentCount: t._count.documents, createdAt: t.createdAt,
      })),
      notifications,
      tasks,
      deadlines,
      recentTransactions,
      chart: { months, deedTypeDistribution, totalIncome, monthsRange: rangeMonths },
    }
  },
})

route('notifications.list', {
  auth: 'session',
  handler: async (_p, ctx) => {
    return db().notification.findMany({
      where: { OR: [{ userId: null }, { userId: ctx.session!.userId }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  },
})

route('notifications.markRead', {
  auth: 'session',
  handler: async (payload, ctx) => {
    const id = (payload as { id?: string })?.id
    if (id) {
      await db().notification.updateMany({
        where: { id, OR: [{ userId: null }, { userId: ctx.session!.userId }] },
        data: { isRead: true },
      })
    } else {
      await db().notification.updateMany({
        where: { OR: [{ userId: null }, { userId: ctx.session!.userId }] },
        data: { isRead: true },
      })
    }
    return { ok: true }
  },
})
